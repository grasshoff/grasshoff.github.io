# famulus-expertise/1 — the preamble of an issue of Famulus Expertise

An issue is a Famulus Notebook (`.fam`). Its YAML front matter carries, beside the Pandoc fields (`title`,
`subtitle`, `author`, `date`, `lang`, `abstract`, `keywords`, `bibliography`), one key `expertise:`. That block is
the machine-readable description of the issue: everything a catalogue, a reader's program or an agent needs to
find the issue, to cite it, to test its statements at the sources, and to use it within its licence. The MCP
server of the series (`famulus-expertise`, tools `fx_*`) serves exactly these blocks.

One source for each fact. The author writes four blocks into the `.fam`; the build stamps the others from the
register (`series.yaml`), the address book (`platform/config/landings.yaml`), the text itself and the gate run.
The complete preamble is published beside each issue as `heft.json`, and the source with the complete
front matter as `heft.fam`.

| block | written by | content |
|---|---|---|
| `schema` | author | the literal `famulus-expertise/1` |
| `subject` | author | what the issue is about |
| `claims` | author | the main statements (Aussagen) of the issue, each with its grounds |
| `agent` | author + build | context for agents |
| `review` | author | who drafted the preamble, who confirmed it |
| `identity` | build | series, numbers, addresses, version, licence |
| `responsibility` | build (+ author: `ai_contribution`) | authors, editor, publisher |
| `evidence` | build | every Famulus reference, citation key and figure the text uses |
| `quality` | build | the run of the quality gates |
| `counting` | build | the state of the VG WORT mark (never a private code) |
| `seal` | build | the quality seal: granted or not, its three conditions, what is missing, who released |
| `critique` | build | every objection on record against the issue, with its state and annotation |

## Blocks the author writes

```yaml
expertise:
  schema: famulus-expertise/1
  subject:
    question: "<the question the issue answers, one sentence>"
    sources:                       # the places of the sources the issue treats; at least one
      - ref: fr:<namespace>/<path>           # a Famulus reference (famulus-ref/2), as sharp as the text allows
        role: object                         # object (what is reconstructed) | witness | literature
        note: "<what stands there, e.g. '§§24–29 of E57'>"
    work: "<author, title of the work treated>"
    edition: "<the edition the addresses belong to>"
    method: "<how the issue proceeds, one or two sentences>"
    limits:                        # what the issue does not show or leaves open; may be empty
      - "<…>"
  claims:                          # 3–10 statements; each must be said in the text of the issue
    - id: C1
      text: "<one proposition, in the words of the issue>"
      section: sec-results         # id of the section of the issue that states it
      status: grounded             # grounded | gap
      grounds: [fr:<…>, fr:<…>]    # addresses that occur in the text of the issue; required when grounded
    - id: C2
      text: "<…>"
      section: sec-limits
      status: gap
      gap: "<why it is not grounded here>"
  agent:
    summary: "<at most 600 characters: what an agent must know before using the issue>"
    read_first: [sec-…, sec-…]     # section ids, in the order an agent should read them
    answers:                       # questions the issue can answer
      - "<…>"
    terms:                         # terms used in a fixed sense
      - {term: "<…>", meaning: "<…>"}
    do_not:                        # misuses to avoid
      - "<e.g. do not quote the reconstruction as Euler's wording>"
  responsibility:
    ai_contribution: "<which parts were drafted with AI systems, or 'none'>"
  review:
    drafted_by: "<name>"
    confirmed_by: null             # the author's name once he has confirmed the preamble
    confirmed_on: null             # ISO date
```

Rules for these blocks:

- Nothing is invented. A field whose content the text does not give is left out or named in `subject.limits`.
- `claims[].text` is a proposition (Aussage). A claim with `status: grounded` names at least one address in
  `grounds`, and every such address occurs in the body of the issue. A claim without grounds has
  `status: gap` and a `gap` reason.
- `section` and `read_first` name section ids that exist in the issue (`{#sec-…}`).
- An unconfirmed preamble (`review.confirmed_by: null`) is a gap of the gate `heft.praeambel.bestaetigt`.

## Blocks the build stamps

```yaml
  identity:
    series: Famulus Expertise
    subseries: Famulus Expertise Euler
    edition: euler                 # slug of the landing
    number: 1                      # within the sub-series
    whole_number: 1                # across the series
    id: tide-raising-force
    ref: fr:expertise/euler/1      # the address of the issue itself
    url: https://famulus.lettre.ai/euler/lettre/1/
    pdf: https://…/tide-raising-force.pdf
    source: https://…/heft.fam
    preamble: https://…/heft.json
    issn: null
    doi: null
    version: "1.0"
    date: 2026-11-10
    status: published
    revisions: [{version, date, note}]
    language: en
    licence: {name, long, url}
    collections: [enestroem, eulerOO, eulerOO-IVA]
  responsibility:
    authors: [{name, orcid, affiliations}]
    editor: Gerd Graßhoff
    publisher: {name, place}
    ai_contribution: "<from the author>"
  evidence:
    references: [{ref, kind, role, count}]   # every fr: address of the text; role: segment | inline | subject | ground
    citations: [<bibliography keys used>]
    figures: [{file, id}]
  agent:
    cite: "<the form of citation>"
    use: {licence, may: [...], may_not: [...]}
    entry_points: {mcp: famulus-expertise, tools: [fx_issue, …], resource: expertise://euler/1}
  quality:
    catalogue: "<version of the gate catalogue>"
    run: "<timestamp>"
    verdict: passed | blocked | inventory
    counts: {erfuellt, verletzt, luecke, offen_modell, fehler, nicht_anwendbar}
    open: [{gate, result, detail}]
  counting:
    vgwort: assigned | eligible, no marker available | not eligible
  seal:
    granted: true | false          # true only when every blocking gate is fulfilled and the author released this text
    date: 2026-11-20               # the day of the release
    version: "1.1"
    released_by: Gerd Graßhoff
    conditions:                    # the three necessary conditions of the series (series.yaml, profile.seal)
      - {id: procedure, fulfilled: true}     # pass through Famulus Lektor, the author agreed to thesis, premises, proof
      - {id: grounding, fulfilled: true}     # sharp Famulus references that resolve; quotations stand at their place
      - {id: correctness, fulfilled: true}   # every other blocking gate
    missing: []                    # what stands against the seal, in words
  critique:                        # objections (famulus-objection/1); a claim they bear on carries `contested: [O1]`
    - id: O1
      version: "1.0"               # the version the objection read
      point: {claim: C3}
      statement: "<the objection>"
      grounds: [{ref: fr:…}]
      by: {name, kind: person | agent}
      status: received | under-examination | convincing | not-convincing | withdrawn
      reason: "<the author's reason>"
      annotation: {text: "<what the issue says at this point from now on>", since_version: "1.1"}
```

## The seal and the author

The author alone is responsible for the statements of the issue (rule R9). The seal says that three necessary
conditions hold and that he released exactly this version: (1) the procedure — the pass through Famulus Lektor, in
which he agreed explicitly to every thesis, every premise and every step of the proof; (2) the grounding evidence —
sharp Famulus references that resolve; (3) argumentative correctness — every blocking quality gate. The seal is
computed (`lettre_gates.siegel`), never entered by hand. No issue is beyond error (rule R10): objections are filed
in the format `famulus-objection/1`, examined by the same standard, and one that convinces is annotated in the
next version.
