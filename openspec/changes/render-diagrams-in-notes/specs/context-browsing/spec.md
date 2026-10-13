## ADDED Requirements

### Requirement: A mermaid block in a rendered document is readable without script and drawn with it
Every document `ctxr serve` renders from markdown through the shell (a note, a catalog section, and the graph
document) SHALL render a fenced code block whose info string's first word is `mermaid` as a block marked as a
diagram, carrying the block's source text, HTML-escaped and otherwise unchanged. With client-side scripting disabled,
that source text SHALL be what the reader sees. With scripting enabled, the page SHALL replace the source with the drawn
diagram. A block the renderer cannot draw SHALL stay visible as its source text, marked as not drawn, and SHALL NOT be
removed or left empty. A fenced block in any other language SHALL render as an ordinary code block, exactly as it does
when no mermaid block is present. A page whose rendered body contains no mermaid block SHALL reference no diagram
script at all.

#### Scenario: With scripting disabled the diagram's source is readable
- **WHEN** a note containing a fenced `mermaid` block is requested by a browser with client-side scripting disabled
- **THEN** the page shows the block's source text, unchanged apart from HTML escaping, inside a block marked as a
  diagram

#### Scenario: With scripting enabled the diagram is drawn
- **WHEN** the same note is requested by a browser with client-side scripting enabled
- **THEN** the block's source is replaced by the drawn diagram

#### Scenario: Source text cannot inject markup
- **WHEN** a `mermaid` block's source contains `<script>` or any other HTML markup
- **THEN** the server's response carries that text HTML-escaped, and with scripting enabled the drawn diagram shows
  the markup as text rather than interpreting it

#### Scenario: A block that cannot be drawn stays readable
- **WHEN** a `mermaid` block contains source the renderer cannot parse, and the page is viewed with scripting enabled
- **THEN** the block's source text remains visible, marked as not drawn, and every other diagram on the page is still
  drawn

#### Scenario: A fenced block in another language is unaffected
- **WHEN** a note contains a fenced block whose info string is `dot`, `d2`, `plantuml`, or any language other than
  `mermaid`
- **THEN** it renders as an ordinary code block, identical to how it rendered before this requirement existed

#### Scenario: A page with no diagram loads no renderer
- **WHEN** a note, catalog section, graph document, or the index page contains no `mermaid` block
- **THEN** its response references no diagram script

#### Scenario: The graph document and catalog draw diagrams the same way
- **WHEN** the graph document or a catalog section contains a fenced `mermaid` block
- **THEN** it is rendered by the same rule a note's block is, readable without script and drawn with it

#### Scenario: A published page carrying a mermaid block is still served byte-verbatim
- **WHEN** a published page's file, under the publish route or the preview route, contains the text of a `mermaid`
  block
- **THEN** the response body is byte-identical to that file on disk, with no diagram markup or script added

### Requirement: Script on a shell page is served by this server and only enhances
The only client-side script a page served through the shell references SHALL be served by this server itself, at a
route under its own asset path, from files belonging to the installed `ctxr` package and its installed dependencies.
It SHALL NOT be fetched from any external network address or content delivery network. No `src` or `href` attribute
the shell or the diagram rendering emits SHALL name an external network address, and drawing a diagram SHALL NOT cause
the browser to request anything from an address other than the server's own. Script SHALL only enhance a page: every
behavior another requirement in this capability says works without client-side script, including choosing a theme and
showing, hiding, and collapsing the navigation, SHALL keep working with scripting disabled on a page that carries a
diagram.

#### Scenario: The renderer is served from the installed package
- **WHEN** a `GET` request names the route the shell references for the diagram renderer
- **THEN** the response is `200` with a JavaScript content type, and its body is byte-identical to the renderer file
  in the installed dependency the `ctxr` package declares

#### Scenario: A page with a diagram names no external address
- **WHEN** a page containing a `mermaid` block is rendered through the shell
- **THEN** every `src` and `href` attribute the shell and the diagram markup emit names a path on this server, and none
  names an `http://` or `https://` address

#### Scenario: Drawing a diagram makes no outside request
- **WHEN** a page containing a `mermaid` block is loaded with scripting enabled
- **THEN** every request the browser makes while loading the page and drawing the diagram is addressed to the server
  that served the page

#### Scenario: Theme and navigation still work without script on a page with a diagram
- **WHEN** a reader, with client-side scripting disabled, chooses a theme or shows or hides the navigation on a page
  containing a `mermaid` block
- **THEN** the choice takes effect exactly as it does on a page with no diagram

#### Scenario: An asset request reads no store content
- **WHEN** a `GET` request names the diagram renderer or the diagram page script
- **THEN** the response is served without reading any file under the store root

### Requirement: A drawn diagram follows the display theme
A diagram drawn on a page served through the shell SHALL use colors that match the theme the page renders in: the
light palette when the light theme is chosen, the dark palette when the dark theme is chosen, and, when the theme
follows the operating system, the palette matching the requesting browser's light/dark preference. The theme SHALL be
resolved from the same choice the server already applied to the page, never from a second preference the script keeps.

#### Scenario: A chosen dark theme draws a dark diagram
- **WHEN** a reader has chosen the dark theme and opens a note containing a `mermaid` block with scripting enabled
- **THEN** the drawn diagram's text, lines, and fills use the dark palette, legible against the dark page background

#### Scenario: A chosen light theme draws a light diagram
- **WHEN** a reader has chosen the light theme and opens a note containing a `mermaid` block with scripting enabled,
  in a browser whose own preference is dark
- **THEN** the drawn diagram uses the light palette, matching the page rather than the browser preference

#### Scenario: Following the system draws in the system's palette
- **WHEN** a reader has made no theme choice, and opens a note containing a `mermaid` block with scripting enabled in a
  browser whose preference is dark
- **THEN** the drawn diagram uses the dark palette, as the rest of the page does

#### Scenario: A system preference change while the page is open redraws the diagram
- **WHEN** the theme follows the operating system and the browser's light/dark preference changes while a page with a
  drawn diagram is open
- **THEN** the diagram is redrawn in the palette matching the new preference, without the page being reloaded
