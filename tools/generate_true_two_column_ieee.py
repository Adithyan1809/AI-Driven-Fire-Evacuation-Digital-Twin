# tools/generate_true_two_column_ieee.py
import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION_START
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_margins(cell, top=30, bottom=30, left=40, right=40):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_shading(cell, color_hex):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_table_borders(table, color="7F8C8D", sz="4", val="single"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
        f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D5D8DC"/>'
        f'  <w:insideV w:val="none"/>'
        f'  <w:left w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(borders)

def make_table_row_cant_split(row):
    trPr = row._tr.get_or_add_trPr()
    trPr.append(OxmlElement('w:cantSplit'))

def set_two_columns(section, space_dxa=288):
    sectPr = section._sectPr
    cols = sectPr.xpath('./w:cols')
    if cols:
        cols[0].set(qn('w:num'), '2')
        cols[0].set(qn('w:space'), str(space_dxa))
    else:
        cols_elm = OxmlElement('w:cols')
        cols_elm.set(qn('w:num'), '2')
        cols_elm.set(qn('w:space'), str(space_dxa))
        sectPr.append(cols_elm)

def set_single_column(section):
    sectPr = section._sectPr
    cols = sectPr.xpath('./w:cols')
    if cols:
        cols[0].set(qn('w:num'), '1')
    else:
        cols_elm = OxmlElement('w:cols')
        cols_elm.set(qn('w:num'), '1')
        sectPr.append(cols_elm)

def build_ieee_manuscript():
    doc = docx.Document()

    # Standard IEEE Conference Page Setup (Letter: 8.5 x 11 in, Margins: Top 0.75 in, Bottom 1.0 in, Left 0.625 in, Right 0.625 in)
    def apply_page_setup(s):
        s.top_margin = Inches(0.75)
        s.bottom_margin = Inches(1.0)
        s.left_margin = Inches(0.625)
        s.right_margin = Inches(0.625)
        s.page_width = Inches(8.5)
        s.page_height = Inches(11.0)

    # Base Styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Times New Roman'
    normal_style.font.size = Pt(10)
    normal_style.font.color.rgb = RGBColor(0, 0, 0)

    # -------------------------------------------------------------
    # SECTION 0: Title and Full 4-Author Block (Single Column Full-Width)
    # -------------------------------------------------------------
    apply_page_setup(doc.sections[0])
    set_single_column(doc.sections[0])

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(12)
    r_title = p_title.add_run("Tiered Semantic Middleware with Deterministic Validation for Telemetry Ingestion and Dynamic Routing in Building Digital Twins")
    r_title.font.name = 'Times New Roman'
    r_title.font.size = Pt(24)
    r_title.bold = True

    # 4-Author Block Table in Authentic IEEE Conference Layout
    t_auth = doc.add_table(rows=2, cols=3)
    t_auth.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_auth_borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'  <w:top w:val="none"/>'
        f'  <w:bottom w:val="none"/>'
        f'  <w:insideH w:val="none"/>'
        f'  <w:insideV w:val="none"/>'
        f'  <w:left w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f'</w:tblBorders>'
    )
    t_auth._tbl.tblPr.append(t_auth_borders)

    authors_data = [
        [
            ("Sandhya N", "Department of AIML", "Dayananda Sagar Academy of Technology and Management", "Bengaluru, India", "hodaiml@dsatm.edu.in"),
            ("Adithyan P", "Department of AIML", "Dayananda Sagar Academy of Technology and Management", "Bengaluru, India", "adithyan18902005@gmail.com"),
            ("Amrutha Varshni G R", "Department of AIML", "Dayananda Sagar Academy of Technology and Management", "Bengaluru, India", "amruthavarshni2005@gmail.com")
        ],
        [
            None,
            ("Apoorva Ganga M S", "Department of AIML", "Dayananda Sagar Academy of Technology and Management", "Bengaluru, India", "msapoorvaganga@gmail.com"),
            None
        ]
    ]

    for r_idx in range(2):
        row = t_auth.rows[r_idx]
        make_table_row_cant_split(row)
        for c_idx in range(3):
            cell = row.cells[c_idx]
            cell.width = Inches(2.4)
            set_cell_margins(cell, top=20, bottom=20, left=30, right=30)
            data = authors_data[r_idx][c_idx]
            if data:
                p = cell.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.line_spacing = 1.05
                p.paragraph_format.space_after = Pt(2)
                
                name_run = p.add_run(data[0] + "\n")
                name_run.font.name = 'Times New Roman'
                name_run.font.size = Pt(10)
                name_run.bold = True
                
                aff_run = p.add_run(f"{data[1]}\n{data[2]}\n{data[3]}\n")
                aff_run.font.name = 'Times New Roman'
                aff_run.font.size = Pt(9)
                aff_run.italic = True
                
                email_run = p.add_run(data[4])
                email_run.font.name = 'Times New Roman'
                email_run.font.size = Pt(9)

    # -------------------------------------------------------------
    # SECTION 1: TRUE TWO-COLUMN LAYOUT THROUGHOUT ENTIRE PAPER BODY
    # (Abstract, Intro, Related Work, Arch, Methodology, Results, Discussion, Limitations, Conclusion, References)
    # -------------------------------------------------------------
    s1 = doc.add_section(WD_SECTION_START.CONTINUOUS)
    apply_page_setup(s1)
    set_two_columns(s1, space_dxa=288)

    def add_sec_heading(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(text)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.bold = True
        return p

    def add_subsec_heading(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run(text)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.italic = True
        return p

    def add_p(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.02
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        r = p.add_run(text)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        return p

    def add_eq(eq_text, eq_num):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(3)
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_eq = p.add_run(f"    {eq_text}")
        r_eq.font.name = 'Times New Roman'
        r_eq.font.size = Pt(9.0)
        r_eq.italic = True
        r_num = p.add_run(f"    ({eq_num})")
        r_num.font.name = 'Times New Roman'
        r_num.font.size = Pt(9.0)
        return p

    # Abstract & Index Terms
    p_abs = doc.add_paragraph()
    p_abs.paragraph_format.space_before = Pt(4)
    p_abs.paragraph_format.space_after = Pt(4)
    p_abs.paragraph_format.line_spacing = 1.02
    p_abs.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    
    r_abs_lbl = p_abs.add_run("Abstract—")
    r_abs_lbl.bold = True
    r_abs_lbl.font.name = 'Times New Roman'
    r_abs_lbl.font.size = Pt(9)
    
    r_abs_txt = p_abs.add_run(
        "Building Digital Twins (DTs) require real-time telemetry from heterogeneous Building Management Systems (BMS), "
        "Fire Alarm Systems (FAS), and IoT sensing networks. Non-standardized vendor schemas, naming conventions, and payload structures "
        "create semantic integration bottlenecks during facility commissioning and runtime adaptation. While Large Language Models (LLMs) "
        "offer natural-language reasoning capabilities for interpreting ambiguous schemas, their non-deterministic outputs, API latency, "
        "and hallucination risks preclude direct integration into authoritative building state or life-safety control paths. "
        "This paper presents a prototype Digital Twin middleware architecture that decouples semantic schema onboarding from runtime execution. "
        "The proposed framework employs an LLM-assisted semantic interpreter (gemini-3.5-flash-lite) exclusively on the cold ingestion path "
        "for unfamiliar schemas, guarded by a deterministic seven-point validation firewall and an in-memory semantic cache. Validated telemetry "
        "updates the spatial Digital Twin state, which is propagated to a dynamic navigation graph where hazard-penalized edge weights drive "
        "shortest-path routing from an occupant's current navigation position using Dijkstra's algorithm. The architecture was evaluated across "
        "an audited 120-case semantic benchmark (39 seen, 81 unseen schemas), a 10-case safety boundary injection suite, a 150-instance (300 execution) "
        "evacuation simulation across five hazard scenarios, and a 100-run hazard penalty sensitivity sweep. Experimental results show that while "
        "deterministic string heuristics achieved higher overall semantic accuracy (70.0% vs. 40.8%) and F1-score (78.5% vs. 44.9%) than the "
        "LLM-assisted approach, the LLM-firewall pipeline achieved 78.4% precision on in-domain admissions and 32.8% F1 on unseen schemas with zero "
        "data leakage. Nine of ten injected anomalous inputs were quarantined at the semantic validation boundary; the remaining stale-telemetry case "
        "was rejected downstream by timestamp-freshness validation, resulting in zero unauthorized Digital Twin state mutations. Runtime latency "
        "measurements demonstrated a cold LLM onboarding latency of 2769.91 ms (median 2131.32 ms, p95 = 5997.26 ms) alongside sub-millisecond warm-path "
        "cache resolution (0.005 ms) and shortest-path recalculation (0.052 ms). In baseline evacuation benchmarks, dynamic path recomputation executed "
        "in 100% of runs (22,870 path updates) but produced identical aggregate egress times (15.84 s) and exposure counts to static routing due to "
        "coarse corridor spatial abstraction and rapid occupant clearance prior to hazard spread. Hazard penalty sensitivity analysis demonstrated "
        "that route switching occurred at penalty factor γ = 2.0, whereas measurable unsafe exposure reductions required γ >= 3.5. This prototype "
        "demonstrates the feasibility of combining LLM-assisted onboarding with deterministic validation boundaries, while establishing the spatial "
        "and temporal conditions governing dynamic routing efficacy."
    )
    r_abs_txt.font.name = 'Times New Roman'
    r_abs_txt.font.size = Pt(9)

    p_kw = doc.add_paragraph()
    p_kw.paragraph_format.space_before = Pt(0)
    p_kw.paragraph_format.space_after = Pt(8)
    p_kw.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r_kw_lbl = p_kw.add_run("Index Terms—")
    r_kw_lbl.bold = True
    r_kw_lbl.font.name = 'Times New Roman'
    r_kw_lbl.font.size = Pt(9)
    r_kw_txt = p_kw.add_run("Digital Twin, Cyber-Physical Systems, Building Management Systems, Fire Alarm Systems, Semantic Interoperability, Large Language Models, Validation Firewall, Dynamic Routing, Emergency Evacuation Simulation.")
    r_kw_txt.font.name = 'Times New Roman'
    r_kw_txt.font.size = Pt(9)

    # --- SECTION I ---
    add_sec_heading("I. INTRODUCTION")
    add_p(
        "Building Digital Twins (DTs) serve as virtualized, bi-directionally synchronized representations of physical infrastructure, "
        "integrating structural geometry, real-time sensor streams, and operational states to support building automation, asset management, "
        "and emergency response simulation [1]–[3]. In life-safety engineering and emergency management, the integration of environmental sensor "
        "streams (e.g., ambient temperature, optical smoke density, thermal rate-of-rise) and spatial occupancy counters into a synchronized Digital "
        "Twin enables dynamic hazard tracking and route optimization during structural fires [4], [5]."
    )
    add_p(
        "However, realizing an operational Digital Twin across modern commercial and academic facilities is hindered by semantic heterogeneity across "
        "building systems [6], [7]. Modern commercial facilities deploy siloed Building Management Systems (BMS), Fire Alarm Systems (FAS), "
        "Heating, Ventilation, and Air Conditioning (HVAC) controllers, access control hardware, and independent IoT environmental sensor meshes. "
        "These subsystems communicate using disparate naming conventions, proprietary point identifiers (e.g., BMS_AHU2_Z101_TMP, FA_SMK_OPT_R101, "
        "ZONE-101-THERM), heterogeneous engineering units (e.g., Celsius, Fahrenheit, Kelvin, millivolts, percent obscuration), and inconsistent "
        "payload structures [8], [9]."
    )
    add_p(
        "Traditionally, reconciling heterogeneous building telemetry requires manual point mapping by systems integration engineers, hard-coded rule "
        "tables, or domain-specific semantic ontologies such as Brick Schema [10] or RealEstateCore [11]. While deterministic ontologies provide "
        "structured formalisms, maintaining static dictionary mappings across multi-vendor renovations, ad-hoc IoT additions, and diverse sensor "
        "legacy naming schemes remains labor-intensive, brittle to syntactic variations, and difficult to scale across heterogeneous multi-facility "
        "portfolios [12]."
    )
    add_p(
        "Recent advances in Large Language Models (LLMs) have demonstrated zero-shot and few-shot reasoning capabilities for semantic schema matching, "
        "natural language data extraction, and cross-domain entity resolution [13], [14]. Nevertheless, deploying LLMs directly inside life-safety or "
        "real-time cyber-physical systems introduces severe vulnerabilities. LLMs are fundamentally non-deterministic, susceptible to semantic "
        "hallucinations (e.g., mapping sensor data to non-existent building zones), vulnerable to prompt injection, and subject to cloud API network "
        "latency spanning several seconds [15], [16]. In emergency evacuation contexts where life safety is paramount, unvalidated LLM output cannot "
        "be permitted to authoritatively mutate building state or direct human routing."
    )
    add_p(
        "Existing work has addressed Digital Twin interoperability, semantic integration, LLM-assisted data processing, and evacuation routing as related "
        "but often separate problems. This work evaluates a prototype that integrates these functions through an LLM-assisted cold path, deterministic "
        "validation boundary, authoritative Digital Twin state, and hazard-aware graph routing within a single experimental cyber-physical pipeline."
    )
    add_p("The primary contributions of this work are:")
    add_p("1) A Tiered Semantic Middleware Architecture that confines LLM inference to a cold-path schema onboarding role, paired with an in-memory hash cache (SemanticMemory) that reduces warm runtime resolution latency to 0.005 ms.")
    add_p("2) A Deterministic Seven-Point Validation Firewall enforcing schema structural validity, canonical entity existence, confidence gating (τ >= 0.75), ambiguity margin thresholds (Δ >= 0.05), attribute allowlisting, and physical value bounds (-20°C <= T <= 200°C, 0 <= smoke <= 1.0), ensuring zero unvalidated state mutations.")
    add_p("3) A Spatial-to-Graph Hazard Propagation Engine that translates spatial telemetry into dynamic navigation graph edge multipliers and evaluates Dijkstra shortest paths starting from an occupant's current intermediate navigation node rather than initial room origins.")
    add_p("4) An Empirical Evaluation and Sensitivity Analysis over an audited 120-case semantic benchmark (39 seen, 81 unseen cases with zero data leakage), a 10-case failure injection suite, 300 evacuation routing executions, and a 100-run hazard penalty sensitivity sweep (γ in {1.5, 2.0, 2.5, 3.5, 5.0}), identifying the spatial, temporal, and parametric constraints governing dynamic evacuation benefits.")

    # --- SECTION II ---
    add_sec_heading("II. RELATED WORK")
    add_subsec_heading("A. Building Digital Twins and Cyber-Physical Systems")
    add_p(
        "Digital Twins for the built environment extend Building Information Modeling (BIM) by coupling static 3D/2D building geometries (Industry Foundation "
        "Classes / IFC) with live sensory telemetry to reflect operational building conditions [1], [2]. Lu et al. [3] established system architectures for "
        "campus-level Digital Twins, demonstrating asset monitoring and predictive maintenance. In safety-critical contexts, Digital Twins have been proposed "
        "for structural health monitoring, fire progression tracking, and virtual emergency training [4], [5]. However, the synchronization of physical telemetry "
        "with virtual representations remains bounded by data integration challenges across proprietary fieldbus protocols and legacy building automation networks [6]."
    )
    add_subsec_heading("B. BMS, FAS, and IoT Semantic Interoperability")
    add_p(
        "Commercial building automation systems traditionally operate over heterogeneous field-level and management-level communication protocols, including "
        "BACnet (ASHRAE 135), Modbus, LonWorks, and MQTT [8], [9]. Even when transport-level interoperability is achieved via IP gateways, semantic interoperability "
        "remains unresolved. Point identifiers are assigned arbitrarily by installation contractors without uniform naming conventions [10]. Automated schema matching "
        "techniques using regular expressions and string distance metrics (e.g., Levenshtein distance, token overlap) exhibit fragility when exposed to novel vendor "
        "abbreviations or non-standard naming syntax [12]."
    )
    add_subsec_heading("C. Semantic Web and Building Ontologies")
    add_p(
        "To standardize building metadata, the Semantic Web and building informatics communities developed formalized ontologies, including Brick Schema [10], "
        "RealEstateCore [11], SAREF4BLDG [18], and the W3C Web of Things (WoT) Thing Description [19]. Brick Schema provides an RDF/OWL class hierarchy modeling "
        "building subsystems, locations, and sensor point relationships. While ontologies formalize the canonical target schema, mapping raw vendor points to "
        "ontology nodes still requires extensive manual engineering or rule generation [12]. The semantic middleware proposed in this paper uses a canonical entity "
        "registry aligned with standard building topology representations as the target for automated semantic mapping."
    )
    add_subsec_heading("D. Large Language Models for Data Integration and Schema Matching")
    add_p(
        "Recent literature has explored LLMs for automated schema matching, entity resolution, and tabular data extraction [13], [14]. Narayan et al. [14] "
        "demonstrated that prompted LLMs achieve competitive performance on relational data matching tasks without domain-specific training. In cyber-physical "
        "systems, researchers have explored LLMs for generating control scripts and translating building automation queries [15]. However, their non-deterministic "
        "nature, susceptibility to hallucinations, and unpredictable latency profiles present severe risks in life-safety domains [16]. This necessitates strict "
        "architectural isolation where LLMs operate strictly as proposal engines under deterministic validation gating."
    )
    add_subsec_heading("E. Hazard-Aware Evacuation and Dynamic Pathfinding")
    add_p(
        "Dynamic emergency evacuation pathfinding models environmental hazards as time-varying cost functions over topological spatial graphs [5], [17]. "
        "Classic algorithms, including Dijkstra's algorithm and A*, compute minimum-cost evacuation paths by penalizing edges traversing fire, smoke, or "
        "structural obstructions [20]. Cellular automata, social force models [21], and multi-agent simulation frameworks simulate human crowd behavior "
        "during egress. Existing research demonstrates that dynamic rerouting efficacy is highly sensitive to sensor latency, hazard propagation velocity, "
        "and route switching penalties [17], [22]. This paper builds upon these principles by experimentally evaluating dynamic Dijkstra routing over a live, "
        "hazard-propagated Digital Twin graph."
    )

    # --- SECTION III ---
    add_sec_heading("III. SYSTEM ARCHITECTURE")
    add_p("The system architecture decouples non-deterministic semantic interpretation from authoritative state mutation and runtime execution (Fig. 1).")

    # Embedded Figure 1 inside 2-column layout
    if os.path.exists('figure1_architecture.png'):
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_img.paragraph_format.space_before = Pt(4)
        p_img.paragraph_format.space_after = Pt(2)
        p_img.add_run().add_picture('figure1_architecture.png', width=Inches(3.45))

        p_cap1 = doc.add_paragraph()
        p_cap1.paragraph_format.space_before = Pt(2)
        p_cap1.paragraph_format.space_after = Pt(6)
        p_cap1.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        r_cap1 = p_cap1.add_run("Fig. 1.  System Architecture: Tiered semantic middleware isolating cold-path LLM inference from authoritative Digital Twin state and dynamic Dijkstra navigation routing.")
        r_cap1.font.name = 'Times New Roman'
        r_cap1.font.size = Pt(8.5)
        r_cap1.italic = True

    add_subsec_heading("A. Heterogeneous Telemetry Ingestion")
    add_p("Telemetry packets from heterogeneous building subsystems arrive as JSON structures via standard endpoints. An incoming payload P is defined as:")
    add_eq("P = ⟨s_raw, v, u, t_in⟩", 1)
    add_p("where s_raw is the raw sensor identifier, v is the scalar/boolean value, u is the engineering unit, and t_in is the ingestion timestamp.")

    add_subsec_heading("B. Tiered Semantic Middleware")
    add_p(
        "When packet P arrives, the middleware queries SemanticMemory, an in-memory hash store indexed by s_raw. If s_raw has been previously validated, "
        "the canonical space identifier e_canon in E and target attribute f in F are resolved in O(1) time (0.005 ms), bypassing the LLM."
    )
    add_p(
        "If s_raw represents an unseen schema, the packet is dispatched to the LLM semantic mapper (gemini-3.5-flash-lite). The model processes P "
        "alongside the canonical building space catalog and generates a candidate proposal:"
    )
    add_eq("M_cand = ⟨e_cand, f_cand, v_norm, conf, Δ_conf⟩", 2)
    add_p("where e_cand is the proposed canonical space, f_cand is the target attribute, v_norm is the unit-normalized value, conf in [0, 1] is the classification confidence, and Δ_conf = conf_1 - conf_2 denotes the confidence margin separating the top two entity predictions.")

    add_subsec_heading("C. Deterministic Seven-Point Validation Firewall")
    add_p("To prevent unvalidated LLM output from corrupting the physical model, M_cand is evaluated by a deterministic validation firewall. State admission is governed by the boolean decision function:")
    add_eq("A(M_cand) = ∏_{i=1}^7 R_i(M_cand) ∈ {0, 1}", 3)
    add_p("where R_i represents the i-th verification rule:")
    add_p("1) R_1 (Structural Schema): Validates non-null payload fields, well-formed JSON syntax, and numeric confidence values.")
    add_p("2) R_2 (Explicit Unknown): Quarantines proposals where the LLM explicitly flags decision: \"UNKNOWN\" or canonical_entity: \"UNKNOWN\".")
    add_p("3) R_3 (Canonical Registry Existence): Enforces e_cand ∈ E, where E is the registered topological space set for the active building.")
    add_p("4) R_4 (Confidence Gating): Enforces conf >= τ, where τ = 0.75.")
    add_p("5) R_5 (Ambiguity Margin): Enforces Δ_conf >= 0.05.")
    add_p("6) R_6 (Attribute Allowlist): Restricts f_cand strictly to registered Digital Twin fields: F_valid = {temperature, smoke, fire_alarm, occupancy, bim_space_type, hazard_level, accessible, status}.")
    add_p("7) R_7 (Physical Value Bounds): Validates that normalized values fall within physical sensor constraints: -20°C <= T <= 200°C, 0.0 <= smoke <= 1.0, 0 <= occupancy <= 500.")
    add_p("Payloads with A(M_cand) = 0 are quarantined with error diagnostic logs. Payloads with A(M_cand) = 1 are committed to SemanticMemory and dispatched to the authoritative state store.")

    add_subsec_heading("D. Digital Twin State Management")
    add_p("The authoritative state store maintains a synchronized representation of physical spaces:")
    add_eq("S_DT(t) = { x_e(t) ∣ e ∈ E }", 4)
    add_p("where x_e(t) = ⟨T_e, S_e, A_e, O_e, H_e⟩ encapsulates temperature, optical smoke density, fire alarm binary state, occupant count, and computed hazard classification H_e ∈ {NORMAL, WARNING, CRITICAL, BLOCKED}.")

    add_subsec_heading("E. Spatial-to-Graph Hazard Propagation")
    add_p(
        "The spatial floor plan is modeled as a topological navigation graph G = (V, E_g, W), where vertices v ∈ V represent room centroids, hallway junctions, "
        "and exit portals, and edges e = (u, v) ∈ E_g represent navigable corridors and doorways. The spatial mapping matrix maps each physical room polygon "
        "to its constituent graph nodes:"
    )
    add_eq("Φ: E → P(V)", 5)
    add_p("When telemetry updates H_e, the HazardEngine updates the cost multiplier m_v of all constituent nodes v ∈ Φ(e):")
    add_eq("m_v(t) = 1.0 (NORMAL),  3.0 (WARNING),  20.0 · γ (CRITICAL),  ∞ (BLOCKED)", 6)
    add_p("where γ >= 1.0 is the hazard penalty parameter. The dynamic effective weight w_t(u, v) for edge (u, v) is defined as:")
    add_eq("w_t(u, v) = w_base(u, v) · max(m_u(t), m_v(t))", 7)

    add_subsec_heading("F. Dynamic Shortest-Path Routing")
    add_p(
        "The RouteOptimizer evaluates minimum-cost evacuation paths over the dynamic graph G_t = (V, E_g, W_t) using Dijkstra's algorithm. "
        "When hazard propagation alters edge weights, active occupants recompute their optimal route to the exit set X = {EXIT_EAST, EXIT_STAIR, EXIT_NORTH_103} "
        "starting from their current intermediate navigation node v_curr:"
    )
    add_eq("π*(t, v_curr) = argmin_{π ∈ Π(v_curr, X)} ∑_{(u, v) ∈ π} w_t(u, v)", 8)

    # --- SECTION IV ---
    add_sec_heading("IV. EXPERIMENTAL METHODOLOGY")
    add_p("The evaluation framework was executed through an automated test harness (reconcile_all_experiments.mjs) across eight experimental protocols:")
    
    add_subsec_heading("A. 120-Case Semantic Mapping Benchmark")
    add_p(
        "A benchmark of N = 120 heterogeneous telemetry payloads across 10 semantic categories was evaluated across four methods: Method A (Deterministic Rules Baseline), "
        "Method B (String Heuristics Baseline), Method C (Raw Gemini LLM Inference), and Method D (Proposed Gemini + 7-Point Firewall). The dataset contains N_pos = 92 "
        "positive in-domain payloads and N_neg = 28 negative/out-of-domain payloads. Metrics are defined as:"
    )
    add_eq("Accuracy = (TP + TN) / N", 9)
    add_eq("Precision = TP / (TP + FP)", 10)
    add_eq("Recall = TP / (TP + FN)", 11)
    add_eq("F1 = (2 · Precision · Recall) / (Precision + Recall)", 12)
    add_p("Strict identity constraint TP + FP + TN + FN = 120 was verified across all methods.")

    add_subsec_heading("B. Audited Seen vs. Unseen Schema Benchmark")
    add_p(
        "The dataset was partitioned into Seen Schemas (N = 39) and Unseen Schemas (N = 81). An automated audit (unseen_leakage_audit.json) verified zero token "
        "or alias overlap between the 81 unseen cases and the deterministic baseline dictionaries or prompt few-shot exemplars."
    )

    add_subsec_heading("C. Validation Firewall Failure Injection Suite")
    add_p(
        "Ten boundary stress cases were injected to evaluate failure containment, covering API timeouts, HTTP 429 errors, malformed JSON, unregistered attributes, "
        "hallucinated spaces, out-of-bounds readings (9999°C), ambiguous matches (Δ_conf < 0.05), sub-threshold confidence (conf < 0.75), and stale timestamps (t_age > 3.0 s)."
    )

    add_subsec_heading("D. Evacuation Simulation Benchmark")
    add_p(
        "Evacuation dynamics were simulated across five hazard scenarios on Building Topology A (50 occupants, 3 exterior exits) across 30 pseudorandom seeds "
        "(Seeds 101–130) under STATIC_NEAREST and DYNAMIC_DT routing modes, producing 5 × 30 × 2 = 300 simulation executions."
    )

    add_subsec_heading("E. Granular Route Divergence and Causal Timing Audit")
    add_p(
        "Graph cost updates, route recalculation calls, occupant reroute evaluations, actual waypoint modifications, and exit assignments were logged across "
        "all 150 scenario instances. Causal timing analysis recorded hazard onset, first route recalculation, median arrival at affected nodes, and median exit times."
    )

    add_subsec_heading("F. Temporal Sensitivity Experiment")
    add_p(
        "A controlled experiment evaluated earlier hazard onset timestamps (t_hazard ∈ {0.5 s, 1.0 s, 2.0 s, 4.0 s}) across 20 seeds (N = 80 runs) to isolate "
        "the temporal conditions governing dynamic routing differences."
    )

    add_subsec_heading("G. Gamma Hazard Penalty Sensitivity Sweep")
    add_p("The hazard penalty parameter γ was evaluated across γ ∈ {1.5, 2.0, 2.5, 3.5, 5.0} across 20 seeds (N = 100 runs) to identify route-switching and exposure-reduction thresholds.")

    add_subsec_heading("H. Latency Profiling")
    add_p("High-resolution execution timers (performance.now()) profiled live HTTP REST calls to gemini-3.5-flash-lite (N = 53), in-memory cache hits (N = 67), heuristic matching, rule lookup, validation firewall, state store mutation, and Dijkstra path recalculation.")

    # --- SECTION V ---
    add_sec_heading("V. RESULTS")

    # --- TABLE I ---
    add_subsec_heading("A. Semantic Mapping Benchmark (N = 120)")
    add_p("Table I presents comparative semantic classification performance across the evaluated methods.")

    p_cap_t1 = doc.add_paragraph()
    p_cap_t1.paragraph_format.space_before = Pt(4)
    p_cap_t1.paragraph_format.space_after = Pt(2)
    p_cap_t1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap_t1 = p_cap_t1.add_run("TABLE I.  120-CASE SEMANTIC MAPPING ABLATION RESULTS")
    r_cap_t1.font.name = 'Times New Roman'
    r_cap_t1.font.size = Pt(8.0)
    r_cap_t1.bold = True

    t1 = doc.add_table(rows=5, cols=6)
    t1.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t1)
    
    t1_widths = [Inches(1.15), Inches(0.38), Inches(0.38), Inches(0.38), Inches(0.38), Inches(0.85)]
    headers_t1 = ["Method", "Acc", "P", "R", "F1", "TP/FP/TN/FN"]
    
    for j, h in enumerate(headers_t1):
        cell = t1.cell(0, j)
        cell.width = t1_widths[j]
        cell.text = h
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(7.5)
        set_cell_margins(cell, top=20, bottom=20, left=20, right=20)
        set_cell_shading(cell, "EAECEE")

    rows_t1 = [
        ["Method A (Rules)", "21.7%", "48.1%", "28.3%", "35.6%", "26 / 28 / 0 / 66"],
        ["Method B (Heuristics)", "70.0%", "86.8%", "71.7%", "78.5%", "66 / 10 / 18 / 26"],
        ["Method C (Raw Gemini)", "40.8%", "74.4%", "31.5%", "44.3%", "29 / 10 / 18 / 63"],
        ["Method D (Gemini+Firewall)", "40.8%", "78.4%", "31.5%", "44.9%", "29 / 8 / 20 / 63"]
    ]
    for i, row_data in enumerate(rows_t1):
        row = t1.rows[i+1]
        make_table_row_cant_split(row)
        for j, val in enumerate(row_data):
            cell = row.cells[j]
            cell.width = t1_widths[j]
            cell.text = val
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if j > 0 else WD_ALIGN_PARAGRAPH.LEFT
            cell.paragraphs[0].runs[0].font.size = Pt(7.5)
            set_cell_margins(cell, top=20, bottom=20, left=20, right=20)

    add_p(
        "On the evaluated benchmark, the string-heuristic baseline (Method B) outperformed the Gemini-assisted approach in aggregate classification "
        "performance (F1 = 78.5% vs. 44.9%). Method D improved precision over raw LLM inference from 74.4% to 78.4% and reduced invalid admissions "
        "from 10 to 8 by quarantining ambiguous and out-of-bounds telemetry. The firewall does not increase recall (31.5%), as sub-threshold outputs "
        "are quarantined rather than repaired."
    )

    # --- TABLE II ---
    add_subsec_heading("B. Seen vs. Unseen Schema Evaluation (N = 39 vs. N = 81)")
    add_p("Table II summarizes performance across the seen and unseen partitions.")

    p_cap_t2 = doc.add_paragraph()
    p_cap_t2.paragraph_format.space_before = Pt(4)
    p_cap_t2.paragraph_format.space_after = Pt(2)
    p_cap_t2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap_t2 = p_cap_t2.add_run("TABLE II.  SEEN (N=39) VS. UNSEEN (N=81) GENERALIZATION")
    r_cap_t2.font.name = 'Times New Roman'
    r_cap_t2.font.size = Pt(8.0)
    r_cap_t2.bold = True

    t2 = doc.add_table(rows=9, cols=7)
    t2.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t2)
    
    t2_widths = [Inches(0.55), Inches(0.95), Inches(0.38), Inches(0.38), Inches(0.38), Inches(0.38), Inches(0.5)]
    headers_t2 = ["Part.", "Method", "Acc", "P", "R", "F1", "TP/FP/TN/FN"]
    
    for j, h in enumerate(headers_t2):
        cell = t2.cell(0, j)
        cell.width = t2_widths[j]
        cell.text = h
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(7.0)
        set_cell_margins(cell, top=20, bottom=20, left=15, right=15)
        set_cell_shading(cell, "EAECEE")

    rows_t2 = [
        ["Seen", "Method A (Rules)", "59.0%", "100%", "59.0%", "74.2%", "23/0/0/16"],
        ["(39)", "Method B (Heuristics)", "79.5%", "100%", "79.5%", "88.6%", "31/0/0/8"],
        ["", "Method C (Raw Gemini)", "43.6%", "100%", "43.6%", "60.7%", "17/0/0/22"],
        ["", "Method D (Gemini+FW)", "43.6%", "100%", "43.6%", "60.7%", "17/0/0/22"],
        ["Unseen", "Method A (Rules)", "3.7%", "9.7%", "5.7%", "7.2%", "3/28/0/50"],
        ["(81)", "Method B (Heuristics)", "65.4%", "77.8%", "66.0%", "71.4%", "35/10/18/18"],
        ["", "Method C (Raw Gemini)", "39.5%", "54.5%", "22.6%", "32.0%", "12/10/18/41"],
        ["", "Method D (Gemini+FW)", "39.5%", "60.0%", "22.6%", "32.8%", "12/8/20/41"]
    ]
    for i, row_data in enumerate(rows_t2):
        row = t2.rows[i+1]
        make_table_row_cant_split(row)
        for j, val in enumerate(row_data):
            cell = row.cells[j]
            cell.width = t2_widths[j]
            cell.text = val
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if j >= 2 else WD_ALIGN_PARAGRAPH.LEFT
            cell.paragraphs[0].runs[0].font.size = Pt(7.0)
            set_cell_margins(cell, top=20, bottom=20, left=15, right=15)

    add_p(
        "On the 81 audited unseen schemas (zero data leakage), deterministic rules degraded to 3.7% accuracy and 7.2% F1. String heuristics maintained "
        "65.4% accuracy and 71.4% F1 due to character token overlap. The proposed Gemini-Firewall pipeline achieved 39.5% accuracy, 60.0% precision, "
        "and 32.8% F1, demonstrating LLM-assisted semantic mapping on unseen schemas while showing that token heuristics remain competitive when raw "
        "strings preserve partial lexical tokens."
    )

    # --- TABLE III ---
    add_subsec_heading("C. Validation Firewall Failure Injection (N = 10)")
    add_p("Table III details the boundary injection results.")

    p_cap_t3 = doc.add_paragraph()
    p_cap_t3.paragraph_format.space_before = Pt(4)
    p_cap_t3.paragraph_format.space_after = Pt(2)
    p_cap_t3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap_t3 = p_cap_t3.add_run("TABLE III.  10-CASE SAFETY BOUNDARY INJECTION SUITE")
    r_cap_t3.font.name = 'Times New Roman'
    r_cap_t3.font.size = Pt(8.0)
    r_cap_t3.bold = True

    t3 = doc.add_table(rows=11, cols=4)
    t3.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t3)
    
    t3_widths = [Inches(0.25), Inches(1.4), Inches(1.45), Inches(0.42)]
    headers_t3 = ["ID", "Injected Failure Mode", "Firewall Status Code", "Mut?"]
    
    for j, h in enumerate(headers_t3):
        cell = t3.cell(0, j)
        cell.width = t3_widths[j]
        cell.text = h
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(7.5)
        set_cell_margins(cell, top=20, bottom=20, left=20, right=20)
        set_cell_shading(cell, "EAECEE")

    rows_t3 = [
        ["1", "Gemini Timeout / Abort", "UNKNOWN_ENTITY (R_1)", "NO"],
        ["2", "HTTP 429 Quota Error", "UNKNOWN_ENTITY (R_1)", "NO"],
        ["3", "Malformed JSON Syntax", "SCHEMA_ERROR (R_1)", "NO"],
        ["4", "Unregistered Field", "REJECTED_UNKNOWN_FIELD (R_6)", "NO"],
        ["5", "Unknown Zone Token", "UNKNOWN_ENTITY (R_2)", "NO"],
        ["6", "Hallucinated Space", "REJECTED_UNKNOWN_ENTITY (R_3)", "NO"],
        ["7", "Out-of-Bounds Reading", "REJECTED_OUT_OF_BOUNDS (R_7)", "NO"],
        ["8", "Ambiguous Match", "LOW_CONFIDENCE_MARGIN (R_5)", "NO"],
        ["9", "Sub-Threshold Conf.", "LOW_CONFIDENCE_SCORE (R_4)", "NO"],
        ["10", "Stale Timestamp (3.8s)", "Downstream Freshness Rejection", "NO"]
    ]
    for i, row_data in enumerate(rows_t3):
        row = t3.rows[i+1]
        make_table_row_cant_split(row)
        for j, val in enumerate(row_data):
            cell = row.cells[j]
            cell.width = t3_widths[j]
            cell.text = val
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if (j == 0 or j == 3) else WD_ALIGN_PARAGRAPH.LEFT
            cell.paragraphs[0].runs[0].font.size = Pt(7.5)
            set_cell_margins(cell, top=20, bottom=20, left=20, right=20)

    add_p(
        "Nine of ten anomalous inputs were quarantined at the semantic validation boundary; the remaining stale-telemetry case was rejected "
        "downstream by timestamp-freshness validation, resulting in zero unauthorized Digital Twin state mutations."
    )

    # --- TABLE IV ---
    add_subsec_heading("D. System Latency Breakdown")
    add_p("Table IV reports execution latency across cold and warm processing paths.")

    p_cap_t4 = doc.add_paragraph()
    p_cap_t4.paragraph_format.space_before = Pt(4)
    p_cap_t4.paragraph_format.space_after = Pt(2)
    p_cap_t4.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap_t4 = p_cap_t4.add_run("TABLE IV.  SYSTEM LATENCY BREAKDOWN ACROSS PATHS")
    r_cap_t4.font.name = 'Times New Roman'
    r_cap_t4.font.size = Pt(8.0)
    r_cap_t4.bold = True

    t4 = doc.add_table(rows=8, cols=5)
    t4.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t4)
    
    t4_widths = [Inches(1.65), Inches(0.3), Inches(0.5), Inches(0.5), Inches(0.55)]
    headers_t4 = ["Component / Operation", "N", "Mean(ms)", "Med(ms)", "P95(ms)"]
    
    for j, h in enumerate(headers_t4):
        cell = t4.cell(0, j)
        cell.width = t4_widths[j]
        cell.text = h
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(7.5)
        set_cell_margins(cell, top=20, bottom=20, left=20, right=20)
        set_cell_shading(cell, "EAECEE")

    rows_t4 = [
        ["Cold: Gemini API HTTP Call", "53", "2769.91", "2131.32", "5997.26"],
        ["Cold: Validation Firewall", "53", "0.012", "0.011", "0.018"],
        ["Cold: Total Onboarding Path", "53", "2770.02", "2131.43", "5997.40"],
        ["Warm: Cache Hash Lookup", "67", "0.005", "0.004", "0.012"],
        ["Warm: State Store Mutation", "67", "0.045", "0.041", "0.068"],
        ["Warm: Dijkstra Recalculation", "67", "0.052", "0.048", "0.089"],
        ["Base: String Heuristics", "120", "0.560", "0.392", "1.773"]
    ]
    for i, row_data in enumerate(rows_t4):
        row = t4.rows[i+1]
        make_table_row_cant_split(row)
        for j, val in enumerate(row_data):
            cell = row.cells[j]
            cell.width = t4_widths[j]
            cell.text = val
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if j >= 1 else WD_ALIGN_PARAGRAPH.LEFT
            cell.paragraphs[0].runs[0].font.size = Pt(7.5)
            set_cell_margins(cell, top=20, bottom=20, left=20, right=20)

    add_p(
        "Live HTTP calls to Gemini averaged 2769.91 ms (minimum 999.26 ms, maximum 8074.60 ms), confirming that LLMs must be excluded from synchronous "
        "sensor loops. In-memory cache lookups executed in 0.005 ms, and warm stream processing executed in 0.062 ms under the evaluated workload."
    )

    # --- SUBSECTION E ---
    add_subsec_heading("E. Route Divergence Statistics (150 Instances)")
    add_p("The divergence audit across the 150 scenario instances established:")
    add_p("- Graph cost recalculations: 630 events\n- Route recalculation calls: 630 invocations\n- Occupant reroute evaluations: 31,500 agent checks\n- Actual waypoint sequence modifications: 22,870 updates\n- Runs with >= 1 waypoint modification: 150 of 150 (100.0%)\n- Runs with exit-choice modification: 0 of 150 (0.0%)\n- Runs with evacuation-time difference: 0 of 150 (0.0%)")
    add_p("Dynamic routing produced substantial intermediate path adaptation (22,870 waypoint updates across 100% of runs), but no aggregate change in evacuation time, unsafe exposure, or exit choice was observed in the baseline benchmark.")

    # --- TABLE V ---
    add_subsec_heading("F. Static vs. Dynamic Evacuation Benchmark (300 Executions)")
    add_p("Table V summarizes evacuation metrics across the five hazard scenarios.")

    p_cap_t5 = doc.add_paragraph()
    p_cap_t5.paragraph_format.space_before = Pt(4)
    p_cap_t5.paragraph_format.space_after = Pt(2)
    p_cap_t5.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap_t5 = p_cap_t5.add_run("TABLE V.  STATIC VS. DYNAMIC EVACUATION BENCHMARK RESULTS")
    r_cap_t5.font.name = 'Times New Roman'
    r_cap_t5.font.size = Pt(8.0)
    r_cap_t5.bold = True

    t5 = doc.add_table(rows=6, cols=5)
    t5.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t5)
    
    t5_widths = [Inches(1.4), Inches(0.5), Inches(0.55), Inches(0.5), Inches(0.55)]
    headers_t5 = ["Scenario & Description", "Mode", "Time (s)", "Success", "Unsafe"]
    
    for j, h in enumerate(headers_t5):
        cell = t5.cell(0, j)
        cell.width = t5_widths[j]
        cell.text = h
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(7.5)
        set_cell_margins(cell, top=20, bottom=20, left=20, right=20)
        set_cell_shading(cell, "EAECEE")

    rows_t5 = [
        ["1: Room 101 Fire Spread", "Stat/Dyn", "15.84±0.84", "100.0%", "13.00"],
        ["2: Corridor Choke Point", "Stat/Dyn", "6.36±0.46", "31.07%", "0.00*"],
        ["3: Smoke Degradation", "Stat/Dyn", "15.84±0.84", "100.0%", "13.00"],
        ["4: Multi-Zone Hazard", "Stat/Dyn", "15.84±0.84", "100.0%", "22.33"],
        ["5: Telemetry Uncertainty", "Stat/Dyn", "15.84±0.84", "100.0%", "13.00"]
    ]
    for i, row_data in enumerate(rows_t5):
        row = t5.rows[i+1]
        make_table_row_cant_split(row)
        for j, val in enumerate(row_data):
            cell = row.cells[j]
            cell.width = t5_widths[j]
            cell.text = val
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if j > 0 else WD_ALIGN_PARAGRAPH.LEFT
            cell.paragraphs[0].runs[0].font.size = Pt(7.5)
            set_cell_margins(cell, top=20, bottom=20, left=20, right=20)

    add_p(
        "(*Note: Scenario 2 produced 34.47 blocked occupants per run due to corridor isolation.) Across all five baseline scenarios, aggregate evacuation "
        "time difference was Δt = 0.0 s and unsafe occupants ΔN_unsafe = 0.00. Egressing occupants (walking velocity 1.2 m/s) reached the central corridor "
        "at median time t = 4.4 s, clearing the primary hazard prior to full smoke spread."
    )

    # --- TABLE VI ---
    add_subsec_heading("G. Temporal Sensitivity Experiment (N = 80 Runs)")
    add_p("Table VI details the controlled temporal sensitivity experiment across earlier hazard activations.")

    p_cap_t6 = doc.add_paragraph()
    p_cap_t6.paragraph_format.space_before = Pt(4)
    p_cap_t6.paragraph_format.space_after = Pt(2)
    p_cap_t6.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap_t6 = p_cap_t6.add_run("TABLE VI.  TEMPORAL SENSITIVITY EXPERIMENT (N=80)")
    r_cap_t6.font.name = 'Times New Roman'
    r_cap_t6.font.size = Pt(8.0)
    r_cap_t6.bold = True

    t6 = doc.add_table(rows=5, cols=5)
    t6.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t6)
    
    t6_widths = [Inches(0.7), Inches(0.65), Inches(0.65), Inches(0.75), Inches(0.75)]
    headers_t6 = ["Onset (t)", "Dyn Time", "Stat Time", "Dyn Unsafe", "Updates"]
    
    for j, h in enumerate(headers_t6):
        cell = t6.cell(0, j)
        cell.width = t6_widths[j]
        cell.text = h
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(7.5)
        set_cell_margins(cell, top=20, bottom=20, left=20, right=20)
        set_cell_shading(cell, "EAECEE")

    rows_t6 = [
        ["t = 0.5 s", "16.3 s", "16.3 s", "14.00", "1360"],
        ["t = 1.0 s", "15.9 s", "15.9 s", "14.00", "1360"],
        ["t = 2.0 s", "14.9 s", "14.9 s", "13.70", "1370"],
        ["t = 4.0 s", "15.1 s", "15.1 s", "14.80", "1772"]
    ]
    for i, row_data in enumerate(rows_t6):
        row = t6.rows[i+1]
        make_table_row_cant_split(row)
        for j, val in enumerate(row_data):
            cell = row.cells[j]
            cell.width = t6_widths[j]
            cell.text = val
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if j > 0 else WD_ALIGN_PARAGRAPH.LEFT
            cell.paragraphs[0].runs[0].font.size = Pt(7.5)
            set_cell_margins(cell, top=20, bottom=20, left=20, right=20)

    add_p(
        "Even under immediate hazard onset (t = 0.5 s), aggregate evacuation duration (16.3 s vs. 16.3 s) and unsafe exposures remained identical "
        "because single-corridor geometry constrained all egress paths to the same physical hallway portals."
    )

    # --- TABLE VII ---
    add_subsec_heading("H. Gamma Hazard Penalty Sensitivity Sweep (N = 100 Runs)")
    add_p("Table VII presents the sensitivity sweep over the hazard penalty factor γ in the gamma hazard-penalty sensitivity experiment.")

    p_cap_t7 = doc.add_paragraph()
    p_cap_t7.paragraph_format.space_before = Pt(4)
    p_cap_t7.paragraph_format.space_after = Pt(2)
    p_cap_t7.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cap_t7 = p_cap_t7.add_run("TABLE VII.  GAMMA (γ) HAZARD PENALTY SWEEP (N=100)")
    r_cap_t7.font.name = 'Times New Roman'
    r_cap_t7.font.size = Pt(8.0)
    r_cap_t7.bold = True

    t7 = doc.add_table(rows=6, cols=5)
    t7.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(t7)
    
    t7_widths = [Inches(0.6), Inches(0.5), Inches(1.4), Inches(0.5), Inches(0.5)]
    headers_t7 = ["Penalty γ", "Cost", "Routing Path (Room 102)", "Time", "Unsafe"]
    
    for j, h in enumerate(headers_t7):
        cell = t7.cell(0, j)
        cell.width = t7_widths[j]
        cell.text = h
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].runs[0].bold = True
        cell.paragraphs[0].runs[0].font.size = Pt(7.5)
        set_cell_margins(cell, top=20, bottom=20, left=20, right=20)
        set_cell_shading(cell, "EAECEE")

    rows_t7 = [
        ["γ = 1.5", "W=4.5", "JUNC_102 -> JUNC_E -> EXIT_EAST", "20.1 s", "29.00"],
        ["γ = 2.0", "W=5.0", "JUNC_102 -> RM_103 -> EXIT_NORTH", "20.1 s", "29.00"],
        ["γ = 2.5", "W=5.5", "JUNC_102 -> RM_103 -> EXIT_NORTH", "20.1 s", "29.00"],
        ["γ = 3.5", "W=6.5", "JUNC_102 -> RM_103 -> EXIT_NORTH", "15.8 s", "13.00"],
        ["γ = 5.0", "W=8.0", "JUNC_102 -> RM_103 -> EXIT_NORTH", "15.8 s", "13.00"]
    ]
    for i, row_data in enumerate(rows_t7):
        row = t7.rows[i+1]
        make_table_row_cant_split(row)
        for j, val in enumerate(row_data):
            cell = row.cells[j]
            cell.width = t7_widths[j]
            cell.text = val
            cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER if j != 2 else WD_ALIGN_PARAGRAPH.LEFT
            cell.paragraphs[0].runs[0].font.size = Pt(7.5)
            set_cell_margins(cell, top=20, bottom=20, left=20, right=20)

    add_p(
        "In the gamma hazard-penalty sensitivity experiment, the results distinguish between route switching and exposure reduction: "
        "(1) Route Switching Threshold (γ = 2.0): At γ = 2.0, edge costs along CORRIDOR_MAIN exceed the alternate path cost through Room 103, "
        "causing the representative path for Seed 42 to switch from EXIT_EAST to EXIT_NORTH_103. (2) Measurable Safety Improvement (γ >= 3.5): "
        "At γ = 2.0 and γ = 2.5, the route switches but aggregate clearance time (20.1 s) and unsafe occupants (29.00) remain unchanged. "
        "Only when γ >= 3.5 in this sensitivity experiment does aggressive graph penalization enforce early diversion before corridor smoke "
        "concentration peaks, reducing mean evacuation time to 15.8 s and unsafe occupants to 13.00."
    )

    # --- SECTION VI ---
    add_sec_heading("VI. DISCUSSION")
    add_p("The empirical findings highlight the architectural trade-offs between LLM semantic flexibility and cyber-physical runtime determinism.")
    add_p(
        "A. Semantic Performance and Baseline Superiority: A central finding is that string heuristics (Method B) outperformed the LLM-assisted "
        "pipeline (Method D) in overall F1-score (78.5% vs. 44.9%) and accuracy (70.0% vs. 40.8%) across the 120-case dataset. This occurred because "
        "building telemetry tags frequently retain structured sub-tokens (e.g., Z101, TEMP, RM-102) that Levenshtein distance and token overlap "
        "resolve effectively with sub-millisecond execution (0.56 ms). The LLM pipeline demonstrated value primarily in interpreting unstructured, "
        "semantic descriptions (e.g., \"Department Head Office Thermistor\") where exact character matches failed. This establishes that LLMs should "
        "not replace deterministic heuristics, but rather serve as a fallback tier within a hybrid integration stack."
    )
    add_p(
        "B. Validation Firewall as a Necessary Safety Boundary: The seven-point validation firewall proved critical in preventing unauthorized "
        "Digital Twin state corruption. In the 120-case evaluation, the firewall improved precision from 74.4% to 78.4% on admitted data. In the 10-case "
        "failure injection suite, nine of ten anomalous inputs were quarantined at the semantic validation boundary; the remaining stale-telemetry "
        "case was rejected downstream by timestamp-freshness validation, resulting in zero unauthorized Digital Twin state mutations. Decoupling "
        "proposal generation from state admission ensures that LLM hallucination risks are bounded by deterministic domain constraints."
    )
    add_p(
        "C. Latency and Architectural Decoupling: Live network profiling demonstrated that Gemini cold-path API calls averaged 2769.91 ms (p95 = 5997.26 ms). "
        "Directly invoking an LLM within a sensor stream would bottleneck building state updates to < 0.4 Hz. By caching validated mappings in "
        "SemanticMemory, runtime stream resolution executes in 0.005 ms, isolating cold-path semantic inference from the deterministic runtime routing loop (0.052 ms)."
    )
    add_p(
        "D. Interpreting the Negative Evacuation Baseline: The absence of aggregate evacuation time improvement (Δt = 0.0 s) in the baseline benchmark "
        "is an important scientific result. Dynamic graph shortest-path routing actively recomputed paths in 100% of runs (22,870 waypoint updates). "
        "However, in a coarse single-corridor floor plan where egress paths share arterial hallway segments, local waypoint adjustments do not inherently "
        "alter gross room-to-exit traversal durations. Dynamic routing provides measurable safety gains only when alternative, topologically independent "
        "egress corridors exist and when hazard penalties (γ >= 3.5) aggressively force early route commitment in the sensitivity experiment."
    )

    # --- SECTION VII ---
    add_sec_heading("VII. LIMITATIONS")
    add_p("This prototype evaluation is subject to several engineering limitations:")
    add_p("1) Synthetic Telemetry Benchmark: Evaluations were conducted using a curated 120-case benchmark rather than a live multi-year industrial BMS/FAS deployment.")
    add_p("2) Coarse 2D Spatial Representation: Corridors are modeled as single contiguous polygons (CORRIDOR_MAIN). Localized smoke events penalize the entire corridor rather than fine-grained sub-grid cells.")
    add_p("3) Simplified Corridor Topology: Single arterial corridor bounds alternate routing paths on the evaluated floor plan.")
    add_p("4) Kinematic Point-Mass Occupants: The agent simulator uses constant velocities and reaction delays without doorway social force dynamics, panic modeling, or bidirectional crowd counter-flow.")
    add_p("5) Hazard Timing Sensitivity: In the baseline benchmark, rapid occupant egress relative to delayed hazard propagation limited measurable static-versus-dynamic exposure differences.")
    add_p("6) In-Memory Semantic Cache: SemanticMemory is volatile and resets upon server restart, requiring database persistence for multi-tenant production.")
    add_p("7) No Physical BMS/FAS Deployment: Evaluated in a simulated testbed without physical sensor hardware interfaces.")
    add_p("8) No CFD Fire/Smoke Simulation: Hazard propagation relies on rule-based tenability thresholds rather than computational fluid dynamics (CFD / NIST FDS) fire modeling.")
    add_p("9) No Physical Sensor Validation: Environmental readings were generated from scenario models rather than physical smoke/fire sensors.")
    add_p("10) No Statutory Life-Safety Certification: The software is an engineering research prototype and has not undergone statutory certification under NFPA 72 or EN 54.")
    add_p("11) Cold-Path Latency Scale: LLM inference latency spans seconds (mean 2.77 s), confining LLM execution strictly to commissioning and offline schema onboarding.")
    add_p("12) Three Configured Topologies: Evaluated across three configured building topologies (Buildings A, B, and C), which demonstrates structural adaptability but does not prove universal generalization across arbitrary multi-story architectures.")
    add_p("13) Limited Benchmark Size: The semantic benchmark comprises 120 test cases and 10 failure injection scenarios.")
    add_p("14) LLM Performance Boundary: The Gemini LLM pipeline does not outperform the deterministic heuristic baseline on the aggregate semantic benchmark.")

    # --- SECTION VIII ---
    add_sec_heading("VIII. CONCLUSION")
    add_p(
        "This paper presented the design, implementation, and empirical evaluation of a tiered semantic middleware and Digital Twin prototype for "
        "building emergency evacuation simulation. By confining LLM semantic inference to a cold-path onboarding role guarded by a deterministic "
        "seven-point validation firewall and in-memory caching, the architecture achieves 78.4% precision on in-domain admissions, zero data leakage "
        "across 81 unseen schemas, zero unauthorized Digital Twin mutations, and 0.005 ms warm-path resolution latency. Live simulation confirmed that "
        "dynamic hazard-weighted Dijkstra pathfinding successfully recomputes agent paths from current navigation waypoints (22,870 path updates). "
        "While baseline evacuation experiments demonstrated that coarse corridor topologies bound aggregate clearance improvements, parameter sweeps "
        "identified the critical thresholds (γ = 2.0 for route switching, γ >= 3.5 for exposure reduction in sensitivity testing) governing dynamic "
        "routing efficacy. Future work will integrate fine-grained spatial discretization, CFD smoke coupling, and persistent semantic registries "
        "for large-scale multi-facility deployments."
    )

    # --- REFERENCES ---
    add_sec_heading("REFERENCES")
    refs = [
        "[1] F. Tao, H. Zhang, A. Liu, and A. Y. C. Nee, \"Digital twin in industry: State-of-the-art,\" IEEE Transactions on Industrial Informatics, vol. 15, no. 4, pp. 2405-2415, Apr. 2019.",
        "[2] K. Lu, X. Xie, M. Parlikad, and J. Schooling, \"Digital twin-enabled smart campus: Architecture, applications, and challenges,\" Automation in Construction, vol. 127, p. 103726, Jul. 2021.",
        "[3] Q. Lu, A. K. Parlikad, P. Woodall, G. Don Ranasinghe, X. Xie, Z. Liang, E. Konstantinou, J. Heaton, and J. Schooling, \"Developing a dynamic digital twin at a building level: Using Cambridge campus as a case study,\" Advanced Engineering Informatics, vol. 46, p. 101187, Oct. 2020.",
        "[4] J. Teizer, \"Status quo and future directions for construction safety and health through advanced digital technologies,\" Safety Science, vol. 80, pp. 1-13, Dec. 2015.",
        "[5] S. Tang, B. C. M. Fung, and E. E. E. Zayed, \"Digital twin for building fire evacuation: A comprehensive review,\" Safety Science, vol. 165, p. 106197, Sep. 2023.",
        "[6] C. Boje, A. Guerriero, S. Kubicki, and Y. Rezgui, \"Towards a semantic Construction Digital Twin: Directions for ontology development,\" Automation in Construction, vol. 114, p. 103179, Jun. 2020.",
        "[7] P. Pauwels, S. Zhang, and Y. C. Lee, \"Semantic web technologies in AEC industry: A literature overview,\" Automation in Construction, vol. 73, pp. 145-165, Jan. 2017.",
        "[8] S. T. Bushby, \"BACnet: a standard communication infrastructure for intelligent buildings,\" Automation in Construction, vol. 6, no. 5-6, pp. 529-540, Dec. 1997.",
        "[9] A. Kastner, W. Granzer, and W. Kastner, \"Open communication in building automation: A comparison of BACnet, KNX, and LONWORKS,\" IEEE Transactions on Industrial Electronics, vol. 57, no. 11, pp. 3577-3586, Nov. 2010.",
        "[10] B. Balaji, A. Bhattacharya, G. Fierro, J. Gao, J. Gluck, D. Hong, A. Johansen, J. Koh, J. Ploennigs, Y. Agarwal, M. Berges, D. Culler, R. Gupta, M. B. Kjærgaard, M. Srivastava, and K. Whitehouse, \"Brick: Towards a unified metadata schema for buildings,\" in Proc. ACM BuildSys, 2016, pp. 41-50.",
        "[11] E. Hammar, K. Hammar, and P. Karlberg, \"RealEstateCore: A modular ontology for smart buildings,\" in Proc. Extended Semantic Web Conference (ESWC), 2019, pp. 124-128.",
        "[12] J. Koh, B. Balaji, V. Sengupta, J. Bender, and Y. Agarwal, \"Plaster: An integration platform for semantic metadata parsing and schema matching in buildings,\" in Proc. ACM BuildSys, 2018, pp. 1-10.",
        "[13] H. Li, J. Feng, and Y. Mao, \"Large language models for data integration: A survey,\" IEEE Transactions on Knowledge and Data Engineering, early access, 2024.",
        "[14] A. Narayan, I. Chami, L. Orr, and C. Ré, \"Can foundation models wrangle your data?\" Proceedings of the VLDB Endowment, vol. 16, no. 4, pp. 738-746, Dec. 2022.",
        "[15] T. Ahmed, M. S. Islam, and A. Rahman, \"LLM-assisted building management systems: Opportunities and security challenges,\" IEEE Internet of Things Magazine, vol. 6, no. 4, pp. 62-68, Dec. 2023.",
        "[16] Y. Ji, Y. Zhang, L. Zhang, and X. Huang, \"A survey on hallucination in large language models: Principles, taxonomy, and challenges,\" ACM Computing Surveys, vol. 56, no. 10, pp. 1-38, Jun. 2024.",
        "[17] X. Zheng, T. Zhong, and M. Liu, \"Modeling crowd evacuation of a building based on cellular automata and dynamic hazard field,\" Fire Safety Journal, vol. 107, pp. 162-172, Jul. 2019.",
        "[18] M. Poveda-Villalón, R. García-Castro, and A. Gómez-Pérez, \"SAREF4BLDG: An extension of SAREF for the building domain,\" Semantic Web, vol. 11, no. 2, pp. 285-300, 2020.",
        "[19] M. Kovatsch, R. Matsukura, M. Lagally, T. Kawaguchi, T. Toumura, and K. Kajimoto, \"W3C Web of Things (WoT) Thing Description,\" W3C Recommendation, 2020.",
        "[20] E. W. Dijkstra, \"A note on two problems in connexion with graphs,\" Numerische Mathematik, vol. 1, no. 1, pp. 269-271, 1959.",
        "[21] D. Helbing and P. Molnar, \"Social force model for pedestrian dynamics,\" Physical Review E, vol. 51, no. 5, pp. 4282-4286, May 1995.",
        "[22] M. Lovreglio, V. Gonzalez, Z. Feng, R. Amor, M. Spearpoint, J. Thomas, M. Trotter, and R. Sacks, \"Prototyping virtual reality serious games for building evacuation training,\" Advanced Engineering Informatics, vol. 38, pp. 145-154, Oct. 2018."
    ]
    for r in refs:
        p_ref = doc.add_paragraph()
        p_ref.paragraph_format.space_before = Pt(0)
        p_ref.paragraph_format.space_after = Pt(2.5)
        p_ref.paragraph_format.left_indent = Inches(0.18)
        p_ref.paragraph_format.first_line_indent = Inches(-0.18)
        p_ref.paragraph_format.line_spacing = 1.0
        p_ref.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        r_run = p_ref.add_run(r)
        r_run.font.name = 'Times New Roman'
        r_run.font.size = Pt(8.0)

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); target_path = os.path.join(project_root, 'docs', 'paper', 'IEEE_Conference_Paper_Digital_Twin.docx')
    doc.save(target_path)
    print(f"SUCCESS: Saved to {target_path}")
    
    try:
        doc.save('output.docx')
        print("SUCCESS: Also saved to output.docx")
    except PermissionError:
        print("NOTE: output.docx is currently open in Microsoft Word. Saved to IEEE_Conference_Paper_Digital_Twin.docx successfully.")


if __name__ == '__main__':
    build_ieee_manuscript()


