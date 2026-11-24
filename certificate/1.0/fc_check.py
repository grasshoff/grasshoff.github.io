#!/usr/bin/env python3
"""fc_check — the independent checker of the Famulus Certificate, format famulus-certificate/1.

Written from the specification (../spec/famulus-certificate-1.0.md), not from the producer's code: it imports nothing
but the Python standard library, never calls a service of the publisher and never calls a language model. It reads a
certificate folder and reports, for every condition the specification gives to the checker, passed | failed | open,
and for the conditions of the author and the referees what their records show. A gap is never passed.

    python3 fc_check.py <certificate-folder> [--json] [--resolve <base-url>]

Exit status: 0 certified, 1 pending, 2 failed, 3 the folder is not a certificate.

--resolve asks a Famulus reference resolver (e.g. http://127.0.0.1:5135) for the current content of every ground and
reports drift (current content differs from the pinned content). Drift is a note, not a failure: the certificate
holds the pinned content, and the pin, not the current state, is what was cited.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

CHECKER = {"name": "fc_check", "version": "1.1.0", "implements": "famulus-certificate/1"}
FORMAT = "famulus-certificate/1"
ELEMENTS = ["AU", "CL", "NV", "GR", "AR", "IC", "RF", "EX", "AC"]
CONDITIONS = {
    "AU": ["AU1", "AU2", "AU3", "AU4", "AU5"], "CL": ["CL1", "CL2", "CL3"], "NV": ["NV1", "NV2"], "GR": ["GR1", "GR2", "GR3", "GR4"],
    "AR": ["AR1", "AR2", "AR3", "AR4"], "IC": ["IC1", "IC2", "IC3", "IC4"], "RF": ["RF1", "RF2", "RF3", "RF4"],
    "EX": ["EX1", "EX2", "EX3"], "AC": ["AC1", "AC2", "AC3", "AC4"],
}
EDGE_KINDS = {"deductive", "defeasible", "computational", "explanatory", "attack", "summary"}
SUPPORT = {"deductive", "defeasible", "computational", "explanatory", "summary"}
PARTS = ["text", "preamble", "argument", "figures", "computations", "translations"]
ROLES = {"none", "assistive", "drafting", "evaluative"}
SOURCE_KINDS = {"recording", "dictation", "manuscript", "outline", "annotations"}
RULE_ID = re.compile(r"^[BQSLATVP][0-9]{1,2}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
PIN = re.compile(r"^fr:[A-Za-z0-9_][A-Za-z0-9_./~-]*@(snap:[0-9]+|rel:[A-Za-z0-9][A-Za-z0-9._-]*|sha:[0-9a-f]{8,64})$")
FILES = ["manifest.json", "claims.json", "novelty.json", "grounds.json", "quotations.json", "argument.json",
         "computations.json", "readings.json", "assents.json", "residual.json", "signatures.json",
         "declaration.json", "critique.json", "release.json", "authorship.json"]


def norm(text: str) -> str:
    """The normalisation nfc-ws1: Unicode NFC, every run of white space one space, trimmed."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text)).strip()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Report:
    def __init__(self) -> None:
        self.rows: dict[str, dict] = {}

    def put(self, cid: str, result: str, detail: str = "", items: list | None = None) -> None:
        assert result in ("passed", "failed", "open")
        self.rows[cid] = {"result": result, "detail": detail, **({"items": items[:50]} if items else {})}

    def ok(self, cid: str, problems: list[str], detail: str = "", open_: bool = False) -> None:
        if problems:
            self.put(cid, "open" if open_ else "failed", detail or f"{len(problems)} problem(s)", problems)
        else:
            self.put(cid, "passed", detail)


def load(folder: Path, name: str):
    p = folder / name
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def acyclic(edges: list[dict]) -> bool:
    graph: dict[str, set[str]] = {}
    for e in edges:
        if e.get("kind") in SUPPORT:
            for t in e.get("tail") or []:
                graph.setdefault(t, set()).add(e["head"])
    state: dict[str, int] = {}

    def visit(n: str) -> bool:
        state[n] = 1
        for m in graph.get(n, ()):
            if state.get(m) == 1 or (state.get(m) is None and not visit(m)):
                return False
        state[n] = 2
        return True

    return all(state.get(n) == 2 or visit(n) for n in list(graph))


ARITH = re.compile(r"^[0-9eE+\-*/().,\s]+$")


def recompute(c: dict) -> str | None:
    """A computation of kind `arith` is re-run here: an expression of numbers and + − × ÷ and brackets, compared with
    the recorded output to the stated number of decimals. Every other kind is not re-runnable by this checker."""
    if c.get("kind") != "arith":
        return None
    expr = str(c.get("expression", ""))
    if not ARITH.match(expr) or "**" in expr:
        return "not an arithmetic expression"
    try:
        value = eval(expr, {"__builtins__": {}}, {})  # noqa: S307 — the pattern above admits numbers and operators only
    except Exception as exc:  # noqa: BLE001
        return f"does not evaluate: {exc}"
    places = int(c.get("decimals", 6))
    if round(float(value), places) != round(float(c.get("output")), places):
        return f"recomputed {round(float(value), places)} ≠ recorded {c.get('output')}"
    return ""


def check(folder: Path, resolve: str | None = None) -> dict:
    r = Report()
    notes: list[str] = []
    man = load(folder, "manifest.json")
    if not isinstance(man, dict) or man.get("format") != FORMAT:
        return {"checker": CHECKER, "error": f"{folder}: no manifest of format {FORMAT}"}
    pub = man.get("publication") or {}
    text_sha, arg_sha = pub.get("text_sha"), pub.get("argument_sha")
    data = {n: load(folder, n) for n in FILES}

    # IC1 — integrity: every file has the hash the manifest names, and every certificate file is listed
    files = man.get("files") or {}
    bad = []
    for name, digest in files.items():
        p = (folder / name).resolve()
        if not p.is_file():
            bad.append(f"{name}: missing")
        elif sha(p.read_bytes()) != digest:
            bad.append(f"{name}: hash differs")
    bad += [f"{n}: not in the manifest" for n in FILES[1:] if (folder / n).is_file() and n not in files]
    for g in data["grounds.json"] or []:
        if g.get("content") and g["content"] not in files:
            bad.append(f"{g['content']}: not in the manifest")
    r.ok("IC1", bad, f"{len(files)} files")

    # CL1, CL2 — the ledger
    claims = data["claims.json"]
    if not isinstance(claims, list) or not claims:
        r.put("CL1", "failed", "no claim ledger")
        r.put("CL2", "failed", "no claim ledger")
        claims = []
    else:
        p1 = [f"{c.get('id')}: {k} missing" for c in claims for k in ("id", "text", "section", "status") if not c.get(k)]
        p1 += [f"{c['id']}: status {c.get('status')}" for c in claims if c.get("status") not in ("grounded", "thesis", "gap")]
        ids = [c.get("id") for c in claims]
        p1 += [f"{i}: id given twice" for i in set(ids) if ids.count(i) > 1]
        r.ok("CL1", p1, f"{len(claims)} claims")
        p2 = [f"{c['id']}: grounded without a ground" for c in claims if c.get("status") == "grounded" and not c.get("grounds")]
        p2 += [f"{c['id']}: gap without a statement of what is missing" for c in claims if c.get("status") == "gap" and not c.get("gap")]
        r.ok("CL2", p2)
    cid = {c.get("id") for c in claims}

    # NV1 — the novelty statement
    nov = data["novelty.json"]
    items = (nov or {}).get("items") if isinstance(nov, dict) else None
    if not items:
        r.put("NV1", "open", (nov or {}).get("gap") if isinstance(nov, dict) and nov.get("gap") else "no novelty statement")
    else:
        p = [f"item {n}: names no claim of the ledger" for n, it in enumerate(items, 1) if not set(it.get("claims") or []) & cid]
        p += [f"item {n}: names no prior work and no search" for n, it in enumerate(items, 1)
              if not it.get("prior") and not it.get("searched")]
        r.ok("NV1", p, f"{len(items)} item(s)")

    # GR1, GR2 — pinned grounds with their content
    grounds = data["grounds.json"] or []
    by_addr = {g.get("address"): g for g in grounds}
    used = sorted({a for c in claims for a in c.get("grounds") or []})
    p1, p2 = [], []
    for a in used:
        if not PIN.match(a):
            p1.append(f"{a}: not pinned")
        g = by_addr.get(a)
        if not g:
            p2.append(f"{a}: no content in the certificate")
            continue
        cp = folder / str(g.get("content") or "")
        if not g.get("content") or not cp.is_file():
            p2.append(f"{a}: content file missing" + (f" ({g['gap']})" if g.get("gap") else ""))
            continue
        h = sha(norm(cp.read_text(encoding="utf-8")).encode("utf-8"))
        pin = a.rsplit("@sha:", 1)[1] if "@sha:" in a else None
        if pin and not h.startswith(pin):
            p2.append(f"{a}: content hash {h[:16]} does not match the pin")
        if g.get("sha256") and g["sha256"] != h:
            p2.append(f"{a}: content hash differs from the recorded hash")
        if resolve and g.get("base"):
            try:
                url = resolve.rstrip("/") + "/api/describe?ref=" + urllib.parse.quote(g["base"], safe="")
                with urllib.request.urlopen(url, timeout=10) as fh:  # noqa: S310
                    now = json.loads(fh.read())
                cur = "\n\n".join(t.get("text") or "" for t in now.get("texts") or [] if t.get("layer") == g.get("layer"))
                if cur and sha(norm(cur).encode("utf-8")) != h:
                    notes.append(f"{a}: the current content of {g['base']} differs from the pinned content (drift)")
            except Exception as exc:  # noqa: BLE001
                notes.append(f"{a}: resolver did not answer ({exc})")
    if not used:
        r.put("GR1", "open", "no grounded claim")
        r.put("GR2", "open", "no grounded claim")
    else:
        r.ok("GR1", p1, f"{len(used)} ground(s)")
        r.ok("GR2", p2)

    # GR3 — verbatim quotations at their ground
    quotes = data["quotations.json"] or []
    p3 = []
    for q in quotes:
        if q.get("kind") != "verbatim":
            continue
        g = by_addr.get(q.get("ground"))
        cp = folder / str((g or {}).get("content") or "")
        if not g or not cp.is_file():
            p3.append(f"«{q.get('text', '')[:50]}»: its ground has no content in the certificate")
        elif norm(q["text"]) not in norm(cp.read_text(encoding="utf-8")):
            p3.append(f"«{q['text'][:50]}»: not found at {q['ground']}")
    r.ok("GR3", p3, f"{sum(1 for q in quotes if q.get('kind') == 'verbatim')} verbatim, "
                    f"{sum(1 for q in quotes if q.get('kind') != 'verbatim')} rendering(s)")

    # AR1, AR2, AR3 — the argument graph
    arg = data["argument.json"]
    if not isinstance(arg, dict) or not arg.get("nodes"):
        for c in ("AR1", "AR2"):
            r.put(c, "open", (arg or {}).get("gap") if isinstance(arg, dict) and arg.get("gap") else "no argument graph")
    else:
        digest = sha((folder / "argument.json").read_bytes())
        r.ok("AR1", [] if digest == arg_sha else [f"argument.json {digest[:16]} ≠ argument_sha {str(arg_sha)[:16]}"])
        nodes = {n["id"] for n in arg["nodes"]}
        edges = arg.get("edges") or []
        p = [f"{e.get('id')}: kind {e.get('kind')}" for e in edges if e.get("kind") not in EDGE_KINDS]
        p += [f"{e.get('id')}: names a node that does not exist" for e in edges
              if e.get("head") not in nodes or any(t not in nodes for t in e.get("tail") or [])]
        if not acyclic(edges):
            p.append("the support relation has a cycle")
        r.ok("AR2", p, f"{len(nodes)} nodes, {len(edges)} edges")
    expl = [c for c in claims if c.get("explanatory")]
    fail, wait = [], []
    for c in expl:
        if c.get("rivals_gap") == "no rival examined":
            continue
        if not c.get("rivals"):
            fail.append(f"{c['id']}: explanatory, names no rival and no gap")
        for x in c.get("rivals") or []:
            if not x.get("discriminating") and not x.get("open"):
                fail.append(f"{c['id']}: rival «{str(x.get('text'))[:40]}» without discriminating case")
            elif not x.get("discriminating"):
                wait.append(f"{c['id']}: rival «{str(x.get('text'))[:40]}» undecided: {x['open']}")
    if fail:
        r.put("AR3", "failed", f"{len(expl)} explanatory claim(s)", fail + wait)
    else:
        r.ok("AR3", wait, f"{len(expl)} explanatory claim(s)", open_=True)

    # IC2, IC3 — computations and readings
    resid = data["residual.json"] or []
    on_list = {(x.get("kind"), x.get("about")) for x in resid}
    p = []
    for c in data["computations.json"] or []:
        res = recompute(c)
        if res is None and ("computation", c.get("id")) not in on_list:
            p.append(f"{c.get('id')}: not re-runnable and not on the residual list")
        elif res:
            p.append(f"{c.get('id')}: {res}")
    r.ok("IC2", p, f"{len(data['computations.json'] or [])} computation(s)")
    p = []
    for x in data["readings.json"] or []:
        p += [f"{x.get('id')}: {k} missing" for k in ("model", "instruction_version", "input_sha", "output_sha") if not x.get(k)]
        if ("reading", x.get("id")) not in on_list:
            p.append(f"{x.get('id')}: not on the residual list")
    r.ok("IC3", p, f"{len(data['readings.json'] or [])} reading(s)")

    # RF1 — completeness of the residual list
    need = set()
    for c in claims:
        need.add(("meaning", c["id"]))
        if c.get("status") == "grounded":
            need |= {("support", f"{c['id']}|{a}") for a in c.get("grounds") or []}
            need.add(("witness", c["id"]))
        if c.get("explanatory"):
            need.add(("rivals", c["id"]))
    need |= {("reading", x.get("id")) for x in data["readings.json"] or []}
    need |= {("rendering", q.get("id")) for q in quotes if q.get("kind") != "verbatim"}
    need.add(("novelty", "statement"))
    missing = sorted(f"{k}: {a}" for k, a in need - on_list)
    r.ok("RF1", missing, f"{len(resid)} item(s)")

    # RF2, RF3, RF4 — signatures
    authors = {(a.get("orcid") or a.get("name")) for a in pub.get("authors") or []}
    sigs = data["signatures.json"] or []
    signed: dict[str, dict] = {}
    p3, p4 = [], []
    for s in sigs:
        who = s.get("referee") or {}
        if (who.get("orcid") or who.get("name")) in authors:
            p3.append(f"{s.get('item')}: signed by an author")
            continue
        if s.get("text_sha") != text_sha or s.get("argument_sha") != arg_sha:
            p3.append(f"{s.get('item')}: signed for another text or argument")
            continue
        if s.get("decision") not in ("agree", "disagree") or not s.get("reason") or not s.get("date"):
            p3.append(f"{s.get('item')}: decision, reason or date missing")
            continue
        signed[s["item"]] = s
    contested = {c["id"] for c in claims if c.get("contested") or c.get("withdrawn")}
    for item, s in signed.items():
        about = next((x.get("about") for x in resid if x.get("id") == item), "")
        if s["decision"] == "disagree" and str(about).split("|")[0] not in contested:
            p4.append(f"{item}: a referee disagrees and the claim is neither contested nor withdrawn")
    unsigned = [x.get("id") for x in resid if x.get("id") not in signed]
    r.ok("RF2", [f"{i}: not signed" for i in unsigned], f"{len(signed)} of {len(resid)} signed", open_=True)
    r.ok("RF3", p3, f"{len(sigs)} signature(s)")
    r.ok("RF4", p4)

    # GR4, NV2 — referee items in particular
    wit = [x["id"] for x in resid if x.get("kind") == "witness"]
    r.ok("GR4", [f"{i}: not signed" for i in wit if i not in signed], f"{len(wit)} witness item(s)", open_=True)
    nv = [x["id"] for x in resid if x.get("kind") == "novelty"]
    if not nv:
        r.put("NV2", "open", "no novelty item on the residual list")
    else:
        r.ok("NV2", [f"{i}: not signed" for i in nv if i not in signed], open_=True)

    # CL3, AR4 — the author's assent, bound to the hashes
    asn = data["assents.json"] or {}
    bound = asn.get("text_sha") == text_sha and asn.get("argument_sha") == arg_sha
    if not asn:
        r.put("CL3", "open", "no record of the author's assent")
        r.put("AR4", "open", "no record of the author's assent")
    elif not bound:
        r.put("CL3", "open", "the assent is bound to another text or argument")
        r.put("AR4", "open", "the assent is bound to another text or argument")
    else:
        r.put("CL3", "passed" if asn.get("ledger_agreed") else "open", "ledger agreed" if asn.get("ledger_agreed") else "ledger not agreed")
        n, ok = int(asn.get("items") or 0), int(asn.get("agreed") or 0)
        r.put("AR4", "passed" if n and ok == n else "open", f"{ok} of {n} items agreed")

    # EX1, EX2 — the editions
    ed = man.get("editions") or {}
    page = (folder / str(ed.get("page") or "")).resolve()
    pdf = (folder / str(ed.get("print") or "")).resolve()
    p1 = []
    if not page.is_file():
        r.put("EX1", "failed", "no page edition")
        r.put("EX2", "failed", "no page edition")
    else:
        html = page.read_text(encoding="utf-8", errors="replace")
        p1 = [f"#claim-{c['id']}: no anchor" for c in claims if f'id="claim-{c["id"]}"' not in html]
        r.ok("EX1", p1)
        p2 = [f"{k}: not a file of the manifest" for k in ("page", "print") if ed.get(k) not in files]
        if not pdf.is_file():
            p2.append("no print edition")
        if "Famulus Certificate FC 1.0" not in html:
            p2.append("the page edition carries no mark")
        r.ok("EX2", p2)

    # AC1, AC2, AC4 — accountability
    auth = pub.get("authors") or []
    p = [] if auth and all(a.get("name") and (a.get("orcid") or a.get("address")) for a in auth) else ["an author without name or identifier"]
    if not text_sha:
        p.append("no text_sha")
    r.ok("AC1", p)
    dec = data["declaration.json"] or {}
    parts = {x.get("part"): x for x in dec.get("parts") or []}
    wrong = [f"{k}: role {s.get('role')}" for k, v in parts.items() for s in v.get("systems") or [] if s.get("role") not in ROLES]
    gaps = [f"{x}: no entry" for x in PARTS if x not in parts]
    if wrong:
        r.put("AC2", "failed", "roles outside the declared list", wrong + gaps)
    else:
        r.ok("AC2", gaps, f"{len(parts)} of {len(PARTS)} parts declared", open_=True)
    crit = data["critique.json"] or []
    p = [f"{o.get('id')}: undecided" for o in crit if o.get("status") in ("received", "under-examination")]
    p += [f"{o.get('id')}: convincing, not annotated" for o in crit
          if o.get("status") == "convincing" and not (o.get("annotation") or {}).get("since_version")]
    r.ok("AC4", p, f"{len(crit)} objection(s)", open_=bool(p) and all("undecided" in x for x in p))

    # AC3 — the author's release and confirmation of the declaration
    rel = data["release.json"] or {}
    if rel.get("text_sha") == text_sha and rel.get("version") == pub.get("version") and dec.get("confirmed_by"):
        r.put("AC3", "passed", f"released by {rel.get('by')} on {rel.get('on')}")
    else:
        r.put("AC3", "open", "no release of this text" if rel.get("text_sha") != text_sha else "AI declaration not confirmed")

    # AU1–AU5 — authorship: the author's sources, theses and structure, the editing record, the rules, the release
    au = data["authorship.json"]
    if not isinstance(au, dict) or not au:
        for c in ("AU1", "AU2", "AU3", "AU4", "AU5"):
            r.put(c, "open", "no authorship record")
    else:
        srcs = au.get("sources") or []
        sid = {x.get("id") for x in srcs}
        p = [f"{x.get('id')}: kind {x.get('kind')}" for x in srcs if x.get("kind") not in SOURCE_KINDS]
        p += [f"{x.get('id')}: no sha256 of the source" for x in srcs if not HEX64.match(str(x.get("sha256") or ""))]
        if not srcs:
            r.put("AU1", "open", "no source of the author named")
        else:
            r.ok("AU1", p, f"{len(srcs)} source(s)")
        th, se = au.get("theses") or [], au.get("sections") or []
        p = [f"{x.get('id')}: origin {x.get('origin')}" for x in th + se if x.get("origin") != "author"]
        p += [f"{x.get('id')}: source {x.get('source')} not among the sources" for x in th + se
              if x.get("origin") == "author" and x.get("source") not in sid]
        if not th or not se:
            r.put("AU2", "failed" if p else "open", "theses or structure not recorded", p)
        else:
            r.ok("AU2", p, f"{len(th)} thesis/theses, {len(se)} section(s)")
        pr = au.get("protocol")
        if not isinstance(pr, dict):
            r.put("AU3", "open", "no editing record")
        else:
            p = [f"{v.get('id')}: version without sha256" for v in pr.get("versions") or [] if not HEX64.match(str(v.get("sha256") or ""))]
            if int(pr.get("unseen_changes") or 0):
                p.append(f"{pr['unseen_changes']} machine change(s) the author did not take over")
            r.ok("AU3", p, f"{pr.get('author_notes', 0)} notes, {pr.get('proposals_inserted', 0)} taken over, "
                           f"{pr.get('proposals_discarded', 0)} discarded, {pr.get('hand_edits', 0)} by hand, "
                           f"{len(pr.get('versions') or [])} version(s)")
        fnd = au.get("findings") or []
        bad = [f"{f.get('id')}: rule {f.get('rule')}" for f in fnd if not RULE_ID.match(str(f.get("rule") or ""))]
        bad += [f"{f.get('id')}: status {f.get('status')}" for f in fnd if f.get("status") not in ("decided", "open")]
        wait = [f"{f.get('id')} ({f.get('rule')}): open" for f in fnd if f.get("status") == "open"]
        if bad:
            r.put("AU4", "failed", f"{len(fnd)} finding(s)", bad + wait)
        else:
            r.ok("AU4", wait, f"{len(fnd)} finding(s) under the rules", open_=True)
        rel_au = data["release.json"] or {}
        if au.get("confirmed_by") and au.get("text_sha") == text_sha and rel_au.get("text_sha") == text_sha:
            r.put("AU5", "passed", f"confirmed by {au['confirmed_by']} on {au.get('confirmed_on')}")
        else:
            r.put("AU5", "open", "authorship not confirmed for this text" if not au.get("confirmed_by") else "bound to another text")

    # EX3 is the series' condition (the PDF mark); the manifest records the series' reading of it
    ex3 = (man.get("series_checks") or {}).get("EX3")
    r.put("EX3", ex3 if ex3 in ("passed", "failed") else "open", "read by the publishing series from the PDF")

    # IC4 — this run is by a program that is not the producer's, and every other checker condition passed
    prod = (man.get("produced_by") or {}).get("name")
    others = [c for c, v in r.rows.items() if v["result"] != "passed" and c not in
              ("CL3", "AR4", "AC3", "NV2", "GR4", "RF2", "EX3", "AU5")]
    if prod == CHECKER["name"]:
        r.put("IC4", "failed", "the producer and the checker are the same program")
    else:
        probs = [f"{c}: {r.rows[c]['result']}" for c in others]
        r.ok("IC4", probs, f"checker {CHECKER['name']} {CHECKER['version']}, producer {prod}",
             open_=all(r.rows[c]["result"] == "open" for c in others))

    elements = {}
    for el in ELEMENTS:
        res = [r.rows[c]["result"] for c in CONDITIONS[el]]
        elements[el] = "failed" if "failed" in res else "open" if "open" in res else "passed"
    vals = list(elements.values())
    state = "failed" if "failed" in vals else "pending" if "open" in vals else "certified"
    held = sum(v == "passed" for v in vals)
    code = "·".join(e if elements[e] == "passed" else f"~~{e}~~" if elements[e] == "failed" else e.lower() for e in ELEMENTS)
    return {"checker": CHECKER, "format": FORMAT, "certificate": str(folder), "publication": pub.get("address"),
            "version": pub.get("version"), "text_sha": text_sha, "argument_sha": arg_sha,
            "manifest_sha": sha((folder / "manifest.json").read_bytes()),
            "state": state, "held": held, "code": code, "elements": elements, "conditions": r.rows, "notes": notes}


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 3
    folder = Path(argv[0])
    resolve = argv[argv.index("--resolve") + 1] if "--resolve" in argv else None
    out = check(folder, resolve)
    if "error" in out:
        print(out["error"], file=sys.stderr)
        return 3
    if "--json" in argv:
        print(json.dumps(out, ensure_ascii=False, indent=1))
    else:
        print(f"{out['publication']} · version {out['version']} · FC 1.0: {out['state']} [{out['code']}] ({out['held']} of {len(ELEMENTS)} elements)")
        for el in ELEMENTS:
            print(f"  {el}  {out['elements'][el]}")
            for c in CONDITIONS[el]:
                row = out["conditions"][c]
                mark = {"passed": "✓", "failed": "✗", "open": "·"}[row["result"]]
                print(f"      {mark} {c} {row['result']:<6} {row['detail']}")
                for it in (row.get("items") or [])[:5]:
                    print(f"            {it}")
        for n in out["notes"]:
            print(f"  note: {n}")
    return {"certified": 0, "pending": 1, "failed": 2}[out["state"]]


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
