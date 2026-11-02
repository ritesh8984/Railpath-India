# RailPath India — Multi-Route Discovery, Transfer Risk & Recommendation Algorithm

## 1. Time-Dependent Railway Graph Model
Let $G = (V, E, T)$ be the railway network where:
- $V$ is the set of physical railway stations identified by their unique Indian Railways station code (`ROU`, `RNC`, `DHN`, `GAYA`, `DDU`, `BSB`, etc.).
- $T$ is the set of scheduled train services, where each train $t \in T$ has:
  - Operating days mask $D_t \subseteq \{\text{Mon, Tue, Wed, Thu, Fri, Sat, Sun}\}$ at its originating station.
  - Ordered sequence of stops $S_t = (s_1, s_2, \dots, s_k)$ where each stop $s_i$ records:
    - Station code $v(s_i) \in V$
    - Scheduled arrival time $\text{arr}(s_i)$ and departure time $\text{dep}(s_i)$ in `Asia/Kolkata` (`HH:MM`)
    - Journey day offset $d(s_i) \ge 1$ relative to the train's originating date
    - Cumulative rail distance $\text{dist}(s_i)$ in kilometres from $s_1$.

### Date-Aware Boarding Eligibility
When a passenger searches for a journey on calendar date $J$ at boarding stop $s_a$:
- The train's originating date is $J_{\text{orig}} = J - (d(s_a) - 1)\text{ days}$.
- Train $t$ operates at $s_a$ on date $J$ if and only if $\text{dayOfWeek}(J_{\text{orig}}) \in D_t$.
- Train $t$ is a valid leg from station $u$ to station $w$ if $u = v(s_a)$, $w = v(s_b)$, and $a < b$ (preserving direction and stop order).
- The leg rail distance is $\Delta \text{dist} = \text{dist}(s_b) - \text{dist}(s_a) > 0$.

---

## 2. Automatic Multi-Route Discovery (2-Leg & 3-Leg Search)

Given origin $O$, destination $D$, journey date $J$, and maximum legs $L_{\max} \in \{2, 3\}$:

1. **Candidate Leg Generation**:
   - Find all trains departing $O$ on date $J$ and collect all reachable downstream interchange stations $I_1 = \{v(s_b) \mid a < b\}$.
   - For 2-leg routes ($O \to M_1 \to D$), identify all intermediate stations $M_1 \in I_1 \setminus \{O, D\}$ that have at least one train reaching $D$.
   - For 3-leg routes ($O \to M_1 \to M_2 \to D$), identify valid pairs $(M_1, M_2)$ with $O, M_1, M_2, D$ all distinct.

2. **Cycle & Backtracking Prevention**:
   - Every station in a candidate path $(v_0, v_1, \dots, v_m)$ must be strictly distinct ($v_i \ne v_j$ for $i \ne j$).
   - Physical transfers must occur at the **exact same station code** $v_i$ by default.
   - Any leg combination where the outgoing train's intermediate stops pass back through an already-visited station is pruned.

3. **Exact Calendar & Midnight-Crossing Layover Calculation**:
   - Suppose Leg $k$ boards at $s_a^{(k)}$ on date $J_k$ (at $t_{\text{dep}}^{(k)}$ minutes from `00:00` on $J_k$).
   - Leg $k$ arrives at interchange $M_k = v(s_b^{(k)})$ at absolute timestamp (in minutes from `00:00` on $J_1$):
     $$T_{\text{arr}}^{(k)} = \text{daysBetween}(J_1, J_k) \times 1440 + \big(d(s_b^{(k)}) - d(s_a^{(k)})\big) \times 1440 + \text{minutes}(\text{arr}(s_b^{(k)}))$$
   - Leg $k+1$ departs $M_k = v(s_c^{(k+1)})$ on calendar date $J_{k+1} \in \{J_{\text{arr}}, J_{\text{arr}} + 1\text{ day}\}$ (provided train $t_{k+1}$ operates on $J_{k+1}$ at $M_k$) at absolute timestamp:
     $$T_{\text{dep}}^{(k+1)} = \text{daysBetween}(J_1, J_{k+1}) \times 1440 + \text{minutes}(\text{dep}(s_c^{(k+1)}))$$
   - The **Scheduled Layover** is:
     $$\text{Layover}_{\text{sched}} = T_{\text{dep}}^{(k+1)} - T_{\text{arr}}^{(k)}$$
   - Any combination with $\text{Layover}_{\text{sched}} < 30\text{ minutes}$ (impossible connection) or $\text{Layover}_{\text{sched}} > 1440\text{ minutes}$ (exceeding 24 hours) is discarded.

---

## 3. Baseline Rail Distance & Detour Percentage

- **Baseline Rail Distance ($D_{\text{base}}$)**:
  - If one or more direct trains exist between $O$ and $D$, $D_{\text{base}}$ is the minimum verified direct rail distance (labeled `Direct Rail Baseline`).
  - If no direct train exists, $D_{\text{base}}$ is the shortest feasible multi-train rail distance discovered across the network (explicitly labeled `Shortest Feasible Network Baseline`).
- **Distance Ratio & Extra Distance Percentage**:
  $$\text{Distance Ratio (\%)} = \frac{D_{\text{route}}}{D_{\text{base}}} \times 100$$
  $$\text{Extra Distance (\%)} = \frac{D_{\text{route}} - D_{\text{base}}}{D_{\text{base}}} \times 100$$
- **Route Categories**:
  - **Low-distance alternatives**: $\text{Extra Distance (\%)} \le 10\%$
  - **Recommended alternatives**: $10\% < \text{Extra Distance (\%)} \le 25\%$ (default maximum acceptable detour threshold)
  - **Longer-distance alternatives**: $\text{Extra Distance (\%)} > 25\%$ (accessible via the user's detour expansion control)

---

## 4. Intelligent Transfer-Buffer & Connection-Risk Evaluation

Let $B_{\text{target}}$ be the user-selected minimum transfer buffer (default `180` minutes; presets: `150` min aggressive, `180` min target, `240` min safer, or custom).
Let:
- $L_{\text{sched}}$ = Scheduled layover in minutes
- $\delta_{\text{live}}$ = Latest reported live arrival delay of the incoming train (or `0` if on time / not delayed)
- $\delta_{p50}, \delta_{p90}$ = Historical median and 90th-percentile arrival delay of the incoming train at the interchange station
- $M_{\text{platform}} = 15$ minutes (minimum physical platform/foot-overbridge transfer time at Indian junction stations)

We compute:
- **Expected Effective Layover (Live/Projected)**: $L_{\text{eff}} = L_{\text{sched}} - \max(\delta_{\text{live}}, \delta_{p50})$
- **Worst-Case (P90) Effective Buffer**: $L_{p90} = L_{\text{sched}} - \max(\delta_{\text{live}}, \delta_{p90})$

### Classification Rules:
1. **`Connection likely missed`**: $L_{\text{sched}} - \delta_{\text{live}} < M_{\text{platform}}$ (incoming train arrives after or within 15 mins of outgoing departure) OR $L_{p90} < 15$ minutes.
2. **`High risk of missing the connection`**: $L_{p90} < 60$ minutes OR $L_{\text{eff}} < \max(60, B_{\text{target}} - 60)$.
3. **`Connection needs attention`**: $L_{\text{sched}} < B_{\text{target}}$ (e.g., 150–179 minutes when target is 180m) OR $L_{p90} < B_{\text{target}} - 30$.
4. **`Comfortable connection`**: $L_{\text{sched}} \ge B_{\text{target}}$ AND $L_{p90} \ge \max(90, B_{\text{target}} - 45)$ with verified historical data.
5. **`Insufficient live data to assess`**: When historical reliability data is unavailable AND live status is unavailable, if $L_{\text{sched}} \ge 90$ minutes, the status warns that scheduled layover is sufficient on paper but historical/live delay data is unavailable.

---

## 5. Transparent 100-Point Recommendation Engine

Each candidate route and train combination is evaluated on 5 normalized component scores $C_i \in [0, 100]$:

| Component | Default Weight | Formula (`0` to `100` scale) |
| :--- | :--- | :--- |
| **1. Railway-Distance Efficiency ($C_{\text{dist}}$)** | **35%** | $100 - \min(100, \max(0, \text{ExtraDistance\%} \times 2.2))$ |
| **2. Connection Safety ($C_{\text{safe}}$)** | **25%** | Based on $L_{p90}$ relative to $B_{\text{target}}$: $100$ when $L_{p90} \ge B_{\text{target}}$, scaled down linearly to $0$ when $L_{p90} \le 15$ min |
| **3. Historical Train Reliability ($C_{\text{rel}}$)** | **20%** | $100 - \min(100, \delta_{p50} \times 0.8 + \delta_{p90} \times 0.4 + \text{rate}_{>60\text{m}} \times 0.6)$ |
| **4. Total Journey Duration ($C_{\text{dur}}$)** | **15%** | $100 \times \min\left(1, \frac{\text{Duration}_{\text{baseline}}}{\text{Duration}_{\text{route}}}\right)$ |
| **5. Transfer Complexity ($C_{\text{tx}}$)** | **5%** | $100$ for 1 transfer (2 legs), $55$ for 2 transfers (3 legs), $20$ for 3+ transfers |

### Missing-Data Weight Renormalization
If Historical Train Reliability ($C_{\text{rel}}$) is unavailable for any incoming leg:
- We **never** assign a fake $100\%$ or $0\text{ min}$ delay score.
- Instead, the $20\%$ reliability weight is excluded and the remaining $80\%$ weights are renormalized to sum to $100\%$:
  - Distance Efficiency: $35 / 80 = 43.75\%$
  - Connection Safety: $25 / 80 = 31.25\%$
  - Journey Duration: $15 / 80 = 18.75\%$
  - Transfer Complexity: $5 / 80 = 6.25\%$
- The **Data Confidence** badge is automatically downgraded from `High` to `Medium (Historical Delay Unavailable)` and an explicit explanation tag `"Historical data unavailable"` is attached to the recommendation breakdown.
