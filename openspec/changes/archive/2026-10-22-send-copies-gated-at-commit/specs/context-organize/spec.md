## ADDED Requirements

### Requirement: Lint reports send copies without a dated name
`ctxr lint` SHALL report, as the `organize.send_copy_name` observation, each send copy — as the publish
capability defines it — anywhere under the store's configured publish path whose name is not
`<YYYY-MM-DD>-<name>.<extension>` led by a real calendar date and a non-empty name, naming the file and its
page folder. It SHALL report on permanent and disposable pages alike, and SHALL NOT report a file in a
subfolder of a page folder or a format outside the send-copy formats. Like every lint observation, it SHALL
NOT change lint's exit code.

#### Scenario: An undated send copy is reported
- **WHEN** a page folder under the configured publish path holds `model.xlsx` beside its `index.html`
- **THEN** `ctxr lint` reports `organize.send_copy_name` for that file, and exits as it would without it

#### Scenario: A store whose send copies are all dated reports nothing
- **WHEN** every send copy under the configured publish path has a dated name
- **THEN** `ctxr lint` reports no `organize.send_copy_name` observation
