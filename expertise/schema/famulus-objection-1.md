# famulus-objection/1 — an objection to an issue of Famulus Expertise

No issue is beyond error (rule R10 of the series). An objection names the point of an issue it contradicts and
gives its grounds. It is recorded, examined by the same standard as the issue (references resolve, a quoted wording
stands at its place, the argument is examined in Famulus Lektor at the point concerned) and kept with its outcome.
The author of the issue classifies it; an objection that convinces is annotated at the point concerned in a new
version of the issue, in the text, in the preamble (`critique`) and in the answers of the MCP server
(`fx_objections`; `fx_claims` marks the claim `contested`). An objection that does not convince stays on record
with the reason.

An objection is a YAML or JSON document; a person or an agent can write it. It is sent to the address the issue
names (`objections_to`); a public tool for filing follows when the MCP server of the series is public.

```yaml
schema: famulus-objection/1
issue: fr:expertise/euler/1          # the issue
version: "1.0"                       # the version the objection reads
point:                               # what is contradicted: exactly one of
  claim: C3                          #   a claim of the preamble (claims[].id)
  # thesis: "<wording>"              #   a thesis or assumption, quoted from the issue
  # section: sec-results             #   a section of the issue
statement: "<the objection as one proposition>"
grounds:                             # at least one
  - ref: fr:enestroem/E57/0018/p03   # a Famulus reference, or
    note: "<what stands there>"
  - citation: "<author, title, year, locus>"
  - argument: "<a step of reasoning>"
by:
  name: "<person or agent>"
  kind: person                       # person | agent
  contact: "<address, optional>"
date: 2026-11-12
```

Fields the register adds (`publication/famulus-lettre/objections/<edition>-<number>.yaml`): `id` (O1, O2, … per
issue), `received`, `status` (`received | under-examination | convincing | not-convincing | withdrawn`), `examination`
(what was checked, with the result), `decision {by, on, reason}` (the author's; no program decides), and for a
convincing objection `annotation {text, since_version}`.
