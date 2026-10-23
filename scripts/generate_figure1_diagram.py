# scripts/generate_figure1_diagram.py
import matplotlib.pyplot as plt
import matplotlib.patches as patches

def generate_figure1():
    fig = plt.figure(figsize=(11, 12), dpi=300)
    ax = fig.add_subplot(111)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 112)
    ax.axis('off')

    # Color Palette - Professional IEEE Academic
    c_blue = '#1E3D59'        # Primary headers
    c_light_blue = '#EAF2F8'  # Ingestion / Telemetry
    c_teal = '#117A65'        # Cache / Validated
    c_light_teal = '#E8F8F5'
    c_purple = '#512E5F'      # LLM Proposal
    c_light_purple = '#F4ECF7'
    c_coral = '#922B21'       # Firewall
    c_light_coral = '#FDEDEC'
    c_navy = '#1B2631'        # State Store
    c_light_navy = '#EAECEE'
    c_gold = '#9A7D0A'        # Hazard & Graph
    c_light_gold = '#FEF9E7'
    c_green = '#1E8449'       # Routing
    c_light_green = '#EAFAF1'

    def draw_box(x, y, w, h, title, subtitle="", fill_color='#FFFFFF', edge_color='#1E3D59', lw=1.5, rx=1.8, title_color='#000000', title_weight='bold', font_size=9.5, sub_size=8.0):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0.5,rounding_size={rx}",
                                      facecolor=fill_color, edgecolor=edge_color, linewidth=lw, zorder=2)
        ax.add_patch(rect)
        if subtitle:
            ax.text(x + w/2, y + h*0.64, title, ha='center', va='center', fontsize=font_size, fontweight=title_weight, color=title_color, zorder=3, family='sans-serif')
            ax.text(x + w/2, y + h*0.28, subtitle, ha='center', va='center', fontsize=sub_size, color='#333333', zorder=3, family='sans-serif')
        else:
            ax.text(x + w/2, y + h/2, title, ha='center', va='center', fontsize=font_size, fontweight=title_weight, color=title_color, zorder=3, family='sans-serif')

    def draw_arrow(x1, y1, x2, y2, label="", color='#1E3D59', lw=1.6, ls='-', label_pos=0.5, label_side='right', font_size=8.0, label_color='#1E3D59'):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, ls=ls, mutation_scale=12), zorder=4)
        if label:
            mx = x1 + (x2 - x1) * label_pos
            my = y1 + (y2 - y1) * label_pos
            offset_x = 1.8 if label_side == 'right' else -1.8
            ha = 'left' if label_side == 'right' else 'right'
            ax.text(mx + offset_x, my, label, ha=ha, va='center', fontsize=font_size, color=label_color, fontweight='bold', zorder=5, family='sans-serif',
                    bbox=dict(boxstyle="square,pad=0.15", facecolor='white', edgecolor='none', alpha=0.9))

    # --- TOP: Heterogeneous Ingestion Layer ---
    draw_box(15, 101, 70, 8, "Heterogeneous Multi-Source Building Telemetry",
             "BMS (BACnet/Modbus) • Fire Alarm (FAS) • IoT Environmental Sensors (MQTT)",
             fill_color=c_light_blue, edge_color=c_blue, lw=1.8, title_color=c_blue)

    draw_arrow(50, 101, 50, 93)

    draw_box(20, 86, 60, 7, "Telemetry Ingestion & Pre-Processing Layer",
             "Payload Parsing: P = ⟨s_raw, v, u, t_in⟩  •  Timestamp Freshness Verification",
             fill_color=c_light_blue, edge_color=c_blue, title_color=c_blue)

    draw_arrow(50, 86, 50, 79)

    # --- MIDDLE: Dispatcher & Bifurcation ---
    draw_box(25, 73, 50, 6, "Semantic Mapping Dispatcher",
             "Lookup raw key s_raw in SemanticMemory Cache",
             fill_color='#FFFFFF', edge_color='#555555', title_color='#222222')

    # Left: Cache Hit (Warm Path)
    draw_arrow(32, 73, 22, 63, label="Cache Hit (Warm Path)\nLatency: 0.005 ms", label_side='left', label_color=c_teal)
    
    # Right: Cache Miss / Unseen Schema (Cold Path)
    draw_arrow(68, 73, 78, 63, label="Cache Miss / Unseen (Cold Path)\nLatency: 2769.91 ms", label_side='right', label_color=c_purple)

    # Gemini LLM Box (Cold Path Only)
    draw_box(58, 52, 38, 11, "Gemini LLM Semantic Mapper",
             "gemini-3.5-flash-lite (Cold Onboarding Role)\nOutputs Candidate Proposal:\nM_cand = ⟨e_cand, f_cand, v_norm, conf, Δ_conf⟩",
             fill_color=c_light_purple, edge_color=c_purple, lw=1.8, title_color=c_purple, font_size=9.2, sub_size=7.6)

    draw_arrow(77, 52, 77, 43, label="Candidate Proposal\n(Unvalidated)", label_side='right', label_color=c_coral)

    # Validation Firewall Box
    draw_box(56, 30, 42, 13, "Deterministic 7-Point Validation Firewall",
             "R1: Schema Syntax • R2: Non-Unknown • R3: Registry Check (e ∈ E)\nR4: Confidence Gating (conf ≥ 0.75) • R5: Ambiguity Margin (Δ ≥ 0.05)\nR6: Attribute Allowlist (f ∈ F_valid) • R7: Physical Bounds (-20°C..200°C)",
             fill_color=c_light_coral, edge_color=c_coral, lw=1.8, title_color=c_coral, font_size=9.2, sub_size=7.2)

    # Rejection quarantine
    ax.annotate('', xy=(98.5, 36.5), xytext=(98, 36.5),
                arrowprops=dict(arrowstyle="-|>", color='#C0392B', lw=1.8))
    ax.text(98.8, 36.5, "Quarantined\n(0 State Mutations)", ha='left', va='center', fontsize=7.2, color='#C0392B', fontweight='bold')

    # Firewall validated output commits to cache
    ax.annotate('', xy=(46, 55), xytext=(56, 38),
                arrowprops=dict(arrowstyle="-|>", color=c_teal, lw=1.8, ls='-'), zorder=4)
    ax.text(50, 48, "Validated & Admitted", ha='center', va='center', fontsize=7.8, color=c_teal, fontweight='bold',
            bbox=dict(boxstyle="square,pad=0.15", facecolor='white', edgecolor='none', alpha=0.9))

    # In-Memory Semantic Memory Cache
    draw_box(6, 49, 40, 12, "SemanticMemory Cache",
             "In-Memory Hash Map (O(1) Resolution)\nCaches Validated Schema Mappings\nIsolates LLM from Deterministic Routing Loop",
             fill_color=c_light_teal, edge_color=c_teal, lw=1.8, title_color=c_teal, font_size=9.5, sub_size=7.8)

    draw_arrow(26, 49, 26, 39)

    # Authoritative DT State Store
    draw_box(6, 27, 40, 12, "Authoritative Digital Twin State Store",
             "Single Source of Truth: S_DT(t) = { x_e(t) | e ∈ E }\nSynchronized Physical State: ⟨T_e, S_e, A_e, O_e, H_e⟩\nGuaranteed Zero Unvalidated Mutations",
             fill_color=c_light_navy, edge_color=c_navy, lw=2.0, title_color=c_navy, font_size=9.5, sub_size=7.8)

    # State Store feeds Egress Frame
    draw_arrow(26, 27, 26, 20)

    # Bottom Area: Hazard Engine, Graph Weights, Routing, Occupant Simulator
    egress_frame = patches.FancyBboxPatch((4, 2), 92, 18, boxstyle="round,pad=0.5,rounding_size=2.0",
                                          facecolor='#FAFAFA', edgecolor='#7F8C8D', linewidth=1.2, ls='--', zorder=1)
    ax.add_patch(egress_frame)
    ax.text(6, 18.5, "Deterministic Cyber-Physical Egress Simulation & Closed-Loop Routing Subsystem", fontsize=8.2, fontweight='bold', color='#2C3E50')

    draw_box(6, 4, 25, 13, "Hazard Engine &\nSpatial Mapping",
             "Tenability Classifier\nRoom Multipliers m_v(t)\nSpatial Matrix Φ: E → P(V)",
             fill_color=c_light_gold, edge_color=c_gold, lw=1.6, title_color=c_gold, font_size=8.5, sub_size=7.4)

    draw_arrow(31, 10.5, 37, 10.5)

    draw_box(37, 4, 25, 13, "Dynamic Weighted\nNavigation Graph",
             "Graph G_t = (V, E_g, W_t)\nDynamic Edge Weights:\nw_t(u,v) = w_base · max(m_u, m_v)",
             fill_color=c_light_gold, edge_color=c_gold, lw=1.6, title_color=c_gold, font_size=8.5, sub_size=7.4)

    draw_arrow(62, 10.5, 68, 10.5)

    draw_box(68, 4, 26, 13, "Dijkstra Dynamic\nRouting Engine",
             "Shortest-Path Optimization\nRecalculates π*(t, v_curr)\nFrom Current Occupant Node\nLatency: 0.052 ms",
             fill_color=c_light_green, edge_color=c_green, lw=1.8, title_color=c_green, font_size=8.5, sub_size=7.4)

    # Closed loop feedback to occupant agents
    draw_arrow(81, 17, 81, 23, label="Real-Time Egress Waypoints", label_side='right', label_color=c_green, ls='--')

    plt.tight_layout()
    plt.savefig('figure1_architecture.png', dpi=300, bbox_inches='tight')
    plt.close()
    print("SUCCESS: High-resolution figure1_architecture.png generated successfully.")

if __name__ == '__main__':
    generate_figure1()

import matplotlib.pyplot as plt
import matplotlib.patches as patches

def generate_figure1():
    fig = plt.figure(figsize=(10, 11), dpi=300)
    ax = fig.add_subplot(111)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 110)
    ax.axis('off')

    # Color Palette - Professional IEEE Academic
    c_blue = '#1E3D59'        # Primary headers
    c_light_blue = '#E8F1F5'  # Ingestion / Telemetry
    c_teal = '#17B890'        # Cache / Validated
    c_light_teal = '#E6F8F3'
    c_purple = '#5C2D91'      # LLM Proposal
    c_light_purple = '#F4EEF9'
    c_coral = '#E05A47'       # Firewall
    c_light_coral = '#FDEEEB'
    c_navy = '#0D2B45'        # State Store
    c_light_navy = '#EBF2F7'
    c_gold = '#D9822B'        # Hazard & Graph
    c_light_gold = '#FEF6ED'
    c_green = '#2B8A3E'       # Routing
    c_light_green = '#EBFBEE'

    def draw_box(x, y, w, h, title, subtitle="", fill_color='#FFFFFF', edge_color='#1E3D59', lw=1.5, rx=1.5, title_color='#000000', title_weight='bold', font_size=9.5, sub_size=8.0):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0.5,rounding_size={rx}",
                                      facecolor=fill_color, edgecolor=edge_color, linewidth=lw, zorder=2)
        ax.add_patch(rect)
        if subtitle:
            ax.text(x + w/2, y + h*0.62, title, ha='center', va='center', fontsize=font_size, fontweight=title_weight, color=title_color, zorder=3, family='sans-serif')
            ax.text(x + w/2, y + h*0.28, subtitle, ha='center', va='center', fontsize=sub_size, color='#444444', zorder=3, family='sans-serif')
        else:
            ax.text(x + w/2, y + h/2, title, ha='center', va='center', fontsize=font_size, fontweight=title_weight, color=title_color, zorder=3, family='sans-serif')

    def draw_arrow(x1, y1, x2, y2, label="", color='#1E3D59', lw=1.5, ls='-', label_pos=0.5, label_side='right', font_size=8.0, label_color='#1E3D59'):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, ls=ls, mutation_scale=12), zorder=4)
        if label:
            mx = x1 + (x2 - x1) * label_pos
            my = y1 + (y2 - y1) * label_pos
            offset_x = 1.5 if label_side == 'right' else -1.5
            ha = 'left' if label_side == 'right' else 'right'
            ax.text(mx + offset_x, my, label, ha=ha, va='center', fontsize=font_size, color=label_color, fontweight='bold', zorder=5, family='sans-serif',
                    bbox=dict(boxstyle="square,pad=0.15", facecolor='white', edgecolor='none', alpha=0.85))

    # --- TOP: Heterogeneous Ingestion Layer ---
    draw_box(15, 99, 70, 8, "Heterogeneous Multi-Source Building Telemetry",
             "BMS (BACnet/Modbus) • Fire Alarm (FAS) • IoT Environmental Sensors (MQTT)",
             fill_color=c_light_blue, edge_color=c_blue, lw=1.8, title_color=c_blue)

    draw_arrow(50, 99, 50, 91)

    draw_box(20, 84, 60, 7, "Telemetry Ingestion & Pre-Processing Layer",
             "Payload Parsing: P = ⟨s_raw, v, u, t_in⟩  •  Timestamp Freshness Verification",
             fill_color=c_light_blue, edge_color=c_blue, title_color=c_blue)

    draw_arrow(50, 84, 50, 77)

    # --- MIDDLE: Dispatcher & Bifurcation ---
    draw_box(25, 71, 50, 6, "Semantic Mapping Dispatcher",
             "Lookup raw key s_raw in SemanticMemory",
             fill_color='#FFFFFF', edge_color='#555555', title_color='#222222')

    # Left: Cache Hit (Warm Path)
    draw_arrow(32, 71, 22, 60, label="Cache Hit (Warm Path)\nLatency: 0.005 ms", label_side='left', label_color=c_teal)
    
    # Right: Cache Miss / Unseen Schema (Cold Path)
    draw_arrow(68, 71, 78, 60, label="Cache Miss / Unseen (Cold Path)\nLatency: 2769.91 ms", label_side='right', label_color=c_purple)

    # Gemini LLM Box (Cold Path Only)
    draw_box(60, 50, 36, 10, "Gemini LLM Semantic Mapper",
             "gemini-3.5-flash-lite (Cold Onboarding Role)\nOutputs Candidate Proposal: M_cand = ⟨e_cand, f_cand, v_norm, conf, Δ_conf⟩",
             fill_color=c_light_purple, edge_color=c_purple, lw=1.6, title_color=c_purple, font_size=9.0, sub_size=7.5)

    draw_arrow(78, 50, 78, 41, label="Candidate Proposal\n(Unvalidated)", label_side='right', label_color=c_coral)

    # Validation Firewall Box
    draw_box(60, 29, 36, 12, "Deterministic 7-Point Validation Firewall",
             "R1: Schema Syntax • R2: Non-Unknown • R3: Registry Check (e ∈ E)\nR4: Confidence Gating (conf ≥ 0.75) • R5: Ambiguity Margin (Δ ≥ 0.05)\nR6: Attribute Allowlist (f ∈ F_valid) • R7: Physical Bounds (-20°C..200°C)",
             fill_color=c_light_coral, edge_color=c_coral, lw=1.8, title_color=c_coral, font_size=9.0, sub_size=7.2)

    # Rejection quarantine
    ax.annotate('', xy=(97, 35), xytext=(96, 35),
                arrowprops=dict(arrowstyle="-|>", color='#D00000', lw=1.5))
    ax.text(97.5, 35, "Quarantined / Rejected\n(Zero State Mutation)", ha='left', va='center', fontsize=7.0, color='#D00000', fontweight='bold')

    # Firewall validated output commits to cache and DT state
    draw_arrow(60, 35, 48, 54, label="Validated & Admitted", label_side='left', label_color=c_teal)

    # In-Memory Semantic Memory Cache
    draw_box(8, 48, 40, 12, "SemanticMemory Cache",
             "In-Memory Hash Map (O(1) Resolution)\nCaches Validated Schema Mappings\nIsolates LLM from Runtime Sensor Loop",
             fill_color=c_light_teal, edge_color=c_teal, lw=1.8, title_color=c_teal, font_size=9.5, sub_size=8.0)

    draw_arrow(28, 48, 28, 38)

    # Authoritative DT State Store
    draw_box(8, 26, 40, 12, "Authoritative Digital Twin State Store",
             "Single Source of Truth: S_DT(t) = { x_e(t) | e ∈ E }\nSynchronized Physical State: ⟨T_e, S_e, A_e, O_e, H_e⟩\nGuaranteed Zero Unvalidated Mutations",
             fill_color=c_light_navy, edge_color=c_navy, lw=2.0, title_color=c_navy, font_size=9.5, sub_size=8.0)

    # State Store feeds Occupants & Hazard Engine
    draw_arrow(28, 26, 28, 19)

    # Bottom Area: Hazard Engine, Graph Weights, Routing, Occupant Simulator
    # Sub-container frame for Egress Layer
    egress_frame = patches.FancyBboxPatch((4, 2), 92, 19, boxstyle="round,pad=0.5,rounding_size=2.0",
                                          facecolor='#FAFAFA', edgecolor='#AAAAAA', linewidth=1.0, ls='--', zorder=1)
    ax.add_patch(egress_frame)
    ax.text(6, 19.5, "Deterministic Cyber-Physical Egress Simulation & Closed-Loop Routing Subsystem", fontsize=8.0, fontweight='bold', color='#555555')

    draw_box(6, 4, 25, 14, "Hazard Engine &\nSpatial Mapping",
             "Tenability Classifier\nRoom Multipliers m_v(t)\nSpatial Matrix Φ: E → P(V)",
             fill_color=c_light_gold, edge_color=c_gold, lw=1.5, title_color=c_gold, font_size=8.5, sub_size=7.5)

    draw_arrow(31, 11, 37, 11)

    draw_box(37, 4, 25, 14, "Dynamic Weighted\nNavigation Graph",
             "Graph G_t = (V, E_g, W_t)\nDynamic Edge Weights:\nw_t(u,v) = w_base · max(m_u, m_v)",
             fill_color=c_light_gold, edge_color=c_gold, lw=1.5, title_color=c_gold, font_size=8.5, sub_size=7.5)

    draw_arrow(62, 11, 68, 11)

    draw_box(68, 4, 26, 14, "Dijkstra Dynamic\nRouting Engine",
             "Shortest-Path Optimization\nRecalculates π*(t, v_curr)\nFrom Current Occupant Node\nLatency: 0.052 ms",
             fill_color=c_light_green, edge_color=c_green, lw=1.8, title_color=c_green, font_size=8.5, sub_size=7.5)

    # Closed loop feedback to occupant agents
    draw_arrow(81, 18, 81, 23, label="Real-Time Egress Waypoints", label_side='right', label_color=c_green, ls='--')

    plt.tight_layout()
    plt.savefig('figure1_architecture.png', dpi=300, bbox_inches='tight')
    plt.close()
    print("SUCCESS: figure1_architecture.png generated successfully.")

if __name__ == '__main__':
    generate_figure1()

