import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    """Sets background color of a table cell."""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=120, bottom=120, left=160, right=160):
    """Set cell padding (in dxa: 20 dxa = 1 pt)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def create_callout_box(doc, text_runs, title=None, border_color="2563EB", bg_color="F0F7FF"):
    """Creates a stylized callout box as a single-cell table."""
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=160, bottom=160, left=200, right=200)
    
    # Left border only
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>\n'
        f'  <w:top w:val="none"/>\n'
        f'  <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>\n'
        f'  <w:bottom w:val="none"/>\n'
        f'  <w:right w:val="none"/>\n'
        f'</w:tcBorders>'
    )
    tcPr.append(tcBorders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    
    if title:
        run_title = p.add_run(f"{title}\n")
        run_title.bold = True
        run_title.font.name = "Calibri"
        run_title.font.size = Pt(11)
        run_title.font.color.rgb = RGBColor(30, 58, 138)
        
    for text, bold, italic in text_runs:
        run = p.add_run(text)
        run.bold = bold
        run.italic = italic
        run.font.name = "Calibri"
        run.font.size = Pt(10.5)
        run.font.color.rgb = RGBColor(31, 41, 55)
        
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def format_table(table, col_widths, headers, data, header_bg="1E3A8A"):
    """Formats a professional data table."""
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    
    # Headers
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], header_bg)
        set_cell_margins(hdr_cells[i], top=140, bottom=140, left=160, right=160)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.bold = True
            r.font.name = "Calibri"
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    # Rows
    for r_idx, row_data in enumerate(data):
        row_cells = table.add_row().cells
        bg = "F9FAFB" if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, cell_value in enumerate(row_data):
            row_cells[c_idx].text = str(cell_value)
            set_cell_background(row_cells[c_idx], bg)
            set_cell_margins(row_cells[c_idx], top=120, bottom=120, left=160, right=160)
            p = row_cells[c_idx].paragraphs[0]
            for r in p.runs:
                r.font.name = "Calibri"
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(31, 41, 55)

    # Apply widths and borders
    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width
            tcPr = row.cells[idx]._tc.get_or_add_tcPr()
            tcBorders = parse_xml(
                f'<w:tcBorders {nsdecls("w")}>\n'
                f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>\n'
                f'  <w:left w:val="none"/>\n'
                f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>\n'
                f'  <w:right w:val="none"/>\n'
                f'</w:tcBorders>'
            )
            tcPr.append(tcBorders)

def build_docx(output_path):
    doc = Document()
    
    # Page Margins
    for sec in doc.sections:
        sec.top_margin = Inches(1.0)
        sec.bottom_margin = Inches(1.0)
        sec.left_margin = Inches(1.0)
        sec.right_margin = Inches(1.0)
        
    # Document Header / Title
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(2)
    run_title = title_p.add_run("CiteLock: System Architecture & Workflow Guide")
    run_title.bold = True
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(24)
    run_title.font.color.rgb = RGBColor(30, 58, 138) # Deep navy
    
    subtitle_p = doc.add_paragraph()
    subtitle_p.paragraph_format.space_after = Pt(14)
    run_sub = subtitle_p.add_run("Self-Correcting RAG, Multi-Verdict Claim Verification & Hallucination Auditor")
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(13)
    run_sub.font.color.rgb = RGBColor(75, 85, 99)
    
    # Callout overview
    create_callout_box(
        doc,
        [
            ("CiteLock is an enterprise-grade retrieval-augmented generation (RAG) platform that audits AI-generated answers against trusted source documents. Rather than assuming model outputs are factual, CiteLock decomposes answers into atomic claims, tests each claim against evidence via a multi-verdict verification judge and type-aware numeric checks, and executes a bounded self-correction loop to repair hallucinations before reaching the user.", False, False)
        ],
        title="Executive Summary",
        border_color="2563EB",
        bg_color="EFF6FF"
    )

    # Section 1: Core Architecture Overview
    h1 = doc.add_heading(level=1)
    r = h1.add_run("1. System Topology & Technology Stack")
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    p.add_run("The platform is engineered as a decoupled, production-hardened system with strict security and state management:\n")
    
    tech_data = [
        ["Layer", "Technology", "Role & Functionality"],
        ["Frontend UI", "Next.js 14+ (App Router), TypeScript, Tailwind CSS", "Interactive chat, real-time node execution graph, evidence side-drawer, and word-level diff viewer."],
        ["Backend API", "Python 3.11+, FastAPI, SQLAlchemy 2.0", "Asynchronous endpoints, pipeline orchestration, multi-provider abstraction, and rate limiting."],
        ["Execution Graph", "LangGraph StateGraph", "Deterministic state machine managing retrieval, decomposition, verification, conditional routing, and revisions."],
        ["Vector Database", "PostgreSQL with pgvector (Neon)", "Hybrid retrieval store indexing dense embedding vectors alongside relational audit trails."],
        ["Document Storage", "Firebase Cloud Storage (Private)", "Secure document persistence isolated from direct browser access via backend signed URLs."],
        ["Authentication", "Firebase Auth & Admin SDK", "Bearer JWT verification with cached public keys and workspace-level multi-tenancy."],
        ["Model Providers", "OpenAI, Google Gemini, Groq", "Abstracted providers for embeddings, answer drafting, verification judging, and self-correction."]
    ]
    
    table_tech = doc.add_table(rows=1, cols=3)
    format_table(table_tech, [Inches(1.3), Inches(2.2), Inches(3.0)], tech_data[0], tech_data[1:])
    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # Section 2: Phase 1 - Ingestion
    h1 = doc.add_heading(level=1)
    r = h1.add_run("2. Phase 1: Document Ingestion & Hybrid Indexing")
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    p.add_run("Before queries can be answered with citations, reference documents must be ingested into the knowledge base through an isolated pipeline:")
    
    steps_ingestion = [
        ("Step 1: Upload & Integrity Validation: ", "Users upload documents via the Next.js dropzone (PDF, DOCX, TXT). FastAPI validates MIME type, file size bounds, and computes a SHA-256 checksum to ensure tamper resistance and prevent redundant duplicate processing."),
        ("Step 2: Private Bucket Storage: ", "Files are stored in private Firebase Cloud Storage under strict isolation paths (workspaces/{workspace_id}/documents/{document_id}/...). Direct client uploads and downloads are denied at the storage rules layer; access is granted only via ephemeral backend signed URLs."),
        ("Step 3: Text Extraction & Semantic Chunking: ", "The backend parsing engine extracts raw text, preserving structural metadata such as headings, page numbers, and character boundaries. Text is divided into semantic passages with calibrated overlap to retain contextual continuity."),
        ("Step 4: Dense & Lexical Vector Indexing: ", "Text chunks are passed to the embedding provider to generate dense vector embeddings. Both the embeddings and lexical tokens are committed to PostgreSQL using pgvector, enabling true hybrid search.")
    ]
    for bold_prefix, text in steps_ingestion:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.line_spacing = 1.15
        r_b = bp.add_run(bold_prefix)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(37, 99, 235)
        bp.add_run(text)
        
    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # Section 3: Phase 2 - The Query & Verification Pipeline
    h1 = doc.add_heading(level=1)
    r = h1.add_run("3. Phase 2: Audited RAG & Self-Correction Pipeline")
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    p.add_run("When a user submits a prompt, CiteLock triggers a compiled LangGraph StateGraph that progresses through 10 deterministic steps:")

    pipeline_steps = [
        ("Step 0: Deterministic Caching & Single-Flight Concurrency",
         "The orchestrator computes a cryptographic hash combining workspace ID, document collection fingerprint, prompt text, and model settings. If a matching verified answer exists, it is served immediately. If multiple identical queries arrive simultaneously, single-flight locking ensures only one leader runs while followers await the result, completely eliminating cache stampedes."),
        
        ("Step 1: Query Input & Policy Resolution (query_input)",
         "Validates the incoming query string, sanitizes input against prompt injection vectors, and extracts workspace configuration policies including maximum allowed correction retries (e.g. 2-3 rounds), the chosen abstention policy ('strict' vs 'soft'), and preferred LLM models."),
         
        ("Step 2: Workspace-Scoped Hybrid Retrieval (evidence_retrieval)",
         "Executes a dual-engine retrieval across the workspace's indexed chunks:\n"
         "• Dense Vector Search: Computes cosine similarity in pgvector to find semantically relevant passages.\n"
         "• Lexical Keyword Search: BM25/full-text matching ensures proper nouns, technical acronyms, and alphanumeric identifiers are captured.\n"
         "Top-k passages are merged, deduplicated, and passed downstream with unique chunk IDs and character offsets."),
         
        ("Step 3: Grounded Answer Synthesis (answer_generation)",
         "An initial draft answer is generated strictly using the retrieved evidence passages. The system prompt instructs the model to abstain or explicitly note gaps if evidence is insufficient, and to embed inline passage citation markers (e.g., [Passage 1])."),
         
        ("Step 4: Atomic Claim Decomposition (claim_decomposition)",
         "The composite draft text is parsed into individual, isolated, atomic factual assertions. By isolating single facts (e.g., 'Company X grew revenue by 14% in 2023') from complex sentences, CiteLock eliminates ambiguity during verification."),
         
        ("Step 5: Multi-Verdict Verification & Numeric Guard (claim_verification)",
         "Every decomposed claim is audited across three independent verification mechanisms:\n"
         "1. Structured LLM Judge: Classifies claim against evidence into one of 5 verdicts.\n"
         "2. Type-Aware Numeric Checker: Compares quantities, currencies, percentages, and dates.\n"
         "3. Provenance Span Matching: Computes token/character offsets linking the claim directly to source passages."),
         
        ("Step 6: Conditional Verification Router (verification_router)",
         "The router calculates pipeline metrics (hallucination rate, grounding rate) and chooses the next branch:\n"
         "• ROUTE_FINALIZE: If 100% of claims are 'supported', proceed directly to finalization.\n"
         "• ROUTE_CORRECT: If any claims are contradicted, unsupported, or partial, and retry limits have not been reached, enter self-correction.\n"
         "• ROUTE_ABSTAIN: If retry limit is reached or the model has stalled without progress, trigger clean abstention.\n"
         "• ROUTE_ERROR: If external model providers fail, gracefully route to the error handler."),
         
        ("Step 7: Bounded Self-Correction (self_correction)",
         "When hallucinations or unsupported claims are detected:\n"
         "1. Targeted Evidence Retrieval: A secondary retrieval query is launched targeting the specific failed claims to see if missing evidence exists elsewhere in the workspace.\n"
         "2. Surgical Revision Prompt: The model receives the original question, prior draft, failed claims with judge rationales, and newly retrieved evidence, and rewrites the response to correct or excise false statements."),
         
        ("Step 8: Re-Verification & Cycle Detection (re_verification)",
         "The revised text is immediately re-decomposed into fresh atomic claims and evaluated by the judge. If the revision made zero progress (identical text or persisting errors), the controller marks the run as stalled to prevent infinite loops, otherwise it evaluates if further correction is needed."),
         
        ("Step 9: Abstention & Final Answer Assembly (final_answer_generation)",
         "If the evidence cannot substantiate the answer after maximum correction rounds, CiteLock returns an honest, standard abstention statement. Otherwise, it compiles the verified final answer, attaches execution metadata, and assigns the overall status ('verified', 'partially_verified', or 'unresolved')."),
         
        ("Step 10: Atomic Relational Persistence (database_persistence)",
         "In a single ACID database transaction, CiteLock writes:\n"
         "• Query record with execution trace telemetry.\n"
         "• Answer record with draft text, final text, and round counts.\n"
         "• Individual Claim records with verdicts and confidence scores.\n"
         "• EvidenceLink records mapping claims to specific document chunk IDs.\n"
         "• VerificationRun records capturing metric shifts across every correction iteration.")
    ]

    for title, desc in pipeline_steps:
        p_step = doc.add_paragraph()
        p_step.paragraph_format.space_before = Pt(6)
        p_step.paragraph_format.space_after = Pt(2)
        p_step.paragraph_format.line_spacing = 1.15
        r_step = p_step.add_run(title)
        r_step.bold = True
        r_step.font.size = Pt(11)
        r_step.font.color.rgb = RGBColor(30, 58, 138)
        
        p_desc = doc.add_paragraph()
        p_desc.paragraph_format.space_before = Pt(0)
        p_desc.paragraph_format.space_after = Pt(6)
        p_desc.paragraph_format.line_spacing = 1.15
        p_desc.add_run(desc)

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # Section 4: Verification Judgments & Numeric Guard
    h1 = doc.add_heading(level=1)
    r = h1.add_run("4. Multi-Verdict Verification Taxonomy & Numeric Guard")
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    p.add_run("CiteLock avoids binary 'true/false' simplifications by employing a nuanced 5-level verdict taxonomy alongside specialized quantitative validation:")

    verdict_data = [
        ["Verdict", "Definition", "Pipeline Action"],
        ["supported", "Directly proven by context passages with high confidence.", "Claim approved; passage citations attached."],
        ["partially_supported", "Main thesis is supported, but minor quantitative or qualitative details lack proof.", "Flagged for surgical rewrite in self-correction."],
        ["contradicted", "Directly conflicts with facts stated in the reference evidence.", "High severity hallucination; triggered for immediate correction."],
        ["unsupported", "Completely unmentioned in reference context; external model hallucination.", "Triggered for removal or replacement in self-correction."],
        ["insufficient_evidence", "Context touches upon topic but lacks definitive proof.", "Self-correction attempts targeted retrieval or abstains."]
    ]
    table_verdicts = doc.add_table(rows=1, cols=3)
    format_table(table_verdicts, [Inches(1.8), Inches(3.0), Inches(1.7)], verdict_data[0], verdict_data[1:])
    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    create_callout_box(
        doc,
        [
            ("Type-Aware Numeric Checking: ", True, False),
            ("Standard string matching often triggers false positives on numbers (e.g. treating '2023' as the number 2,023 instead of a calendar year). CiteLock's numeric guard parses and classifies numeric entities into distinct types: dates (YYYY-MM-DD), 4-digit calendar years, currencies ($/€/£), percentages (%), scaled quantities (million/billion/k), and integer counts. Claims containing numeric statements are verified with exact type-awareness to ensure zero mathematical hallucinations.", False, False)
        ],
        title="Quantitative Integrity Guarantee",
        border_color="059669",
        bg_color="ECFDF5"
    )

    # Section 5: Real-time UI & Visual Verification UX
    h1 = doc.add_heading(level=1)
    r = h1.add_run("5. Real-Time UI Streaming & Visual Verification UX")
    r.font.color.rgb = RGBColor(30, 58, 138)

    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.15
    p.add_run("The Next.js frontend delivers complete observability and provenance exploration to end users:")
    
    ui_features = [
        ("Server-Sent Events (SSE) Streaming: ", "FastAPI streams graph lifecycle events (node_start, node_complete, route_decision) in real-time, preventing request timeouts on long-running multi-pass audits."),
        ("Interactive Node Execution Graph: ", "Visualizes the active LangGraph nodes (retrieval -> generation -> verification -> correction) with latency timers, live status indicators, and inspection modals."),
        ("Interactive Claim Highlighting: ", "Sentences in the final answer are tagged with color-coded badges indicating verification verdict (green for supported, amber for partial, red for contradicted)."),
        ("Evidence Drawer: ", "Clicking any sentence opens a side-drawer displaying the exact source document, page number, and highlighted excerpt with character span offsets."),
        ("Word-Level Diff Viewer: ", "Allows users to inspect side-by-side what changed between the initial hallucinated draft and the self-corrected final output.")
    ]
    for bold_prefix, text in ui_features:
        bp = doc.add_paragraph(style='List Bullet')
        bp.paragraph_format.line_spacing = 1.15
        r_b = bp.add_run(bold_prefix)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(37, 99, 235)
        bp.add_run(text)

    # Section 6: Key Metrics & Safeguards
    doc.add_paragraph().paragraph_format.space_after = Pt(10)
    h1 = doc.add_heading(level=1)
    r = h1.add_run("6. Summary of Architectural Safeguards")
    r.font.color.rgb = RGBColor(30, 58, 138)

    safeguards_data = [
        ["Safeguard", "Implementation", "Impact"],
        ["Cache Stampede Prevention", "Single-Flight Group Mutex", "Concurrent identical queries share one execution; zero redundant model spend."],
        ["Bounded Iteration", "Hard Max Rounds (max: 3)", "Prevents infinite loops and runaway token costs when evidence is missing."],
        ["Stall Detection", "Revision History Fingerprinting", "Terminates correction if LLM produces unchanged drafts across passes."],
        ["Foreign Key Integrity", "Chunk Pre-Validation", "Verifies chunk IDs exist in database prior to inserting EvidenceLinks."],
        ["Private Storage Isolation", "Firebase Security Rules", "Direct client uploads/downloads denied; 100% routed through authenticated backend."],
        ["Audit Immutability", "Append-Only Audit Events Table", "Every query, revision round, and document action is indelibly recorded."]
    ]
    table_safeguards = doc.add_table(rows=1, cols=3)
    format_table(table_safeguards, [Inches(1.8), Inches(2.2), Inches(2.5)], safeguards_data[0], safeguards_data[1:])

    doc.save(output_path)
    print(f"Document saved successfully at: {output_path}")

if __name__ == "__main__":
    out_dir = r"c:\Users\Dell\.gemini\antigravity-ide\scratch\CiteLock"
    file_path = os.path.join(out_dir, "CiteLock_Workflow_and_Architecture_Guide.docx")
    build_docx(file_path)
