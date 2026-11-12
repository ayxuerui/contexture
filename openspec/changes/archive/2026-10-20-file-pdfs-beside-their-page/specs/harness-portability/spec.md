## ADDED Requirements

### Requirement: The publish skill files a page's PDF beside its index page, dated, and never replaces one
The rendered `ctxr-publish` skill SHALL instruct that a PDF rendering of a page is written directly
into the page's folder, beside its `index.html`, under a file name led by the date it was rendered;
that a PDF is never a page on its own, so a document sent as a PDF still has an `index.html` the PDF
was printed from; that a PDF a page uses as an input belongs in the page's `assets/`, not at the
folder root; and that rendering a changed page writes a new dated PDF and leaves every earlier one
untouched, because an earlier file may be what a recipient was sent. It SHALL name how the PDF is
produced as the store's choice, and SHALL NOT name a renderer contexture ships. The enforcing
mechanism is the test over the rendered skill set.

#### Scenario: A PDF is filed beside the index page with its date
- **WHEN** an agent follows the publish skill to produce a PDF of a page
- **THEN** it is instructed to write it at the page folder's root, beside `index.html`, under a file
  name led by the render date

#### Scenario: A re-render keeps the earlier PDF
- **WHEN** an agent follows the publish skill to produce a PDF of a page that already holds one
- **THEN** it is instructed to write a new dated file and to leave the earlier file unchanged

#### Scenario: An input PDF stays in assets
- **WHEN** an agent follows the publish skill for a page that uses a PDF it did not render
- **THEN** it is instructed to place that file in the page's `assets/`
