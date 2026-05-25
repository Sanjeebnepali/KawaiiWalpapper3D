# Subscription Model — Full Diagrams

A complete visual walkthrough of how the subscription/premium system works
(changes/158). Diagram-first; for the prose reference see
[`SUBSCRIPTION_ARCHITECTURE.md`](./SUBSCRIPTION_ARCHITECTURE.md).

All diagrams are Mermaid — they render on GitHub and in most Markdown viewers.

---

## 0. What's premium

Four independently-buyable areas + an All Access bundle. Each maps to one
persisted flag in `store/settings.ts`.

```mermaid
flowchart LR
    subgraph Areas["4 premium areas (à la carte)"]
        A1["Theme Packs"]
        A2["Mood Themes"]
        A3["Premium Collection"]
        A4["Couple Theme"]
    end
    subgraph Bundle["Bundle"]
        B0["All Access"]
    end
    A1 --> F1["entThemePacks"]
    A2 --> F2["entMood"]
    A3 --> F3["entCollection"]
    A4 --> F4["isCouplePremium (+ coupleSource)"]
    B0 --> F0["allAccess — grants all four"]
```

| Area | Flag | Premium part | Free part |
|---|---|---|---|
| Theme Packs | `entThemePacks` | custom albums, 15/30/custom timers, smart shuffle | default packs, 1h–24h timers, 1 free album |
| Mood Themes | `entMood` | every mood feature | — |
| Premium Collection | `entCollection` | applying the 60 wallpapers | browsing them |
| Couple Theme | `isCouplePremium` | generating a couple code | browsing couple packs |
| All Access | `allAccess` | all of the above | — |

---

## 1. System map — the whole model on one page

```mermaid
flowchart TB
    subgraph UI["UI — gated features"]
        TP["Theme Packs<br/>custom album / 15-30m timers"]
        MD["Mood features x6"]
        PC["Premium-collection apply"]
        CPL["Couple — generate code"]
    end

    GF["gateFeature(feature, onUnlock)<br/>components/PremiumLock.tsx"]

    subgraph READ["Read path — lib/billing.ts"]
        HE["hasEntitlement(feature)"]
        UE["useEntitlement(feature) — reactive"]
    end

    SW["SUBSCRIPTIONS_ENABLED<br/>constants/billing.ts"]

    subgraph STORE["store/settings.ts — persisted"]
        FLAGS["allAccess · entThemePacks · entMood<br/>entCollection · isCouplePremium · coupleSource"]
    end

    subgraph PAGE["app/subscription.tsx — the paywall"]
        PG["checkboxes + Monthly/Yearly toggle"]
    end

    WP["purchasePlans(ids, period)<br/>WRITE path — lib/billing.ts"]

    TP --> GF
    MD --> GF
    PC --> GF
    CPL --> GF

    GF -->|"check"| HE
    HE --> FLAGS
    HE -. reads .-> SW
    GF -->|"locked → navigate"| PAGE
    PG --> WP
    WP --> FLAGS
    FLAGS --> UE
    UE -->|"re-render, unlock"| UI
```

---

## 2. Gate decision — what `hasEntitlement` returns

```mermaid
flowchart TD
    A["hasEntitlement(feature)"] --> B{"SUBSCRIPTIONS_ENABLED ?"}
    B -->|"false — testing"| T1["return TRUE — everything unlocked"]
    B -->|"true — enforced"| C{"allAccess ?"}
    C -->|"yes"| T2["return TRUE"]
    C -->|"no"| D["look up the feature's own flag"]
    D --> E{"flag set ?"}
    E -->|"yes"| T3["return TRUE — owned à la carte"]
    E -->|"no"| F["return FALSE — locked → paywall"]
```

---

## 3. Tap-to-unlock flow (sequence)

```mermaid
sequenceDiagram
    actor U as User
    participant S as Gated screen
    participant G as gateFeature
    participant B as lib/billing
    participant P as Subscription page
    participant ST as settings store

    U->>S: tap premium feature
    S->>G: gateFeature('mood', action)
    G->>B: hasEntitlement('mood')
    B-->>G: false (locked)
    G->>P: router.push('/subscription?highlight=mood')
    Note over P: 'mood' row pre-checked
    U->>P: choose plans + Monthly/Yearly
    U->>P: tap Subscribe
    P->>B: purchasePlans(['mood'], 'monthly')
    B->>ST: set entMood = true
    ST-->>S: useEntitlement re-renders (unlocked)
    U->>S: tap feature again → action runs
```

> The deferred action is **not** auto-resumed across navigation — after
> subscribing the user taps the feature again. This matches every store paywall.

---

## 4. Purchase → which flags flip

```mermaid
flowchart LR
    PP["purchasePlans(ids, period)"] --> BP["billingPeriod = period"]
    PP --> L{"for each id in ids"}
    L -->|"allAccess"| O1["allAccess = true"]
    L -->|"themePacks"| O2["entThemePacks = true"]
    L -->|"mood"| O3["entMood = true"]
    L -->|"collection"| O4["entCollection = true"]
    L -->|"couple"| O5["grantCoupleEntitlement('purchased')"]
```

---

## 5. Couple Theme — the buyer/partner rule

One subscription unlocks **one partner at a time**. The buyer shares a
`LOVE-XXXX` code; the partner unlocks for free **while linked**, then is
**re-locked on unlink**. `coupleSource` records which side you are.

### 5a. State machine

```mermaid
stateDiagram-v2
    [*] --> Locked

    Locked --> Purchased: buy Couple / All Access
    Locked --> Inherited: enter partner's LOVE-XXXX code

    Inherited --> Locked: unlink → reconcile(false) — REVOKED (never paid)
    Purchased --> Purchased: unlink → reconcile(false) — KEPT (buyer paid)

    note left of Purchased
        coupleSource = 'purchased'
        survives unlink + reinstall
        (re-derived from isCreator)
    end note
    note right of Inherited
        coupleSource = 'inherited'
        re-locked the moment the pair ends
    end note
```

### 5b. Two devices end-to-end

```mermaid
sequenceDiagram
    actor B as Buyer (creator)
    participant DB as Supabase
    actor P as Partner (accepter)

    B->>B: purchasePlans(['couple']) → coupleSource = 'purchased'
    B->>DB: create_couple() → LOVE-XXXX  (requires entitlement)
    B-->>P: shares the code
    P->>DB: accept_couple_code(LOVE-XXXX)
    DB-->>P: linked
    P->>P: grantCoupleEntitlement('inherited')
    Note over B,P: both unlocked while linked

    rect rgb(40,30,30)
    Note over B,P: later — someone unlinks
    B->>DB: unlink_couple()
    B->>B: reconcile(false) → 'purchased' KEPT
    DB-->>P: realtime: status = unlinked
    P->>P: reconcile(false) → 'inherited' REVOKED
    end
```

### 5c. The revoke fires at three points (so both phones converge)

```mermaid
flowchart LR
    U1["I unlink"] --> R1["unlinkCouple()<br/>reconcile(false)"]
    U2["Partner unlinks,<br/>my app OPEN"] --> R2["realtime status=unlinked<br/>reconcile(false)"]
    U3["Partner unlinked,<br/>my app was CLOSED"] --> R3["coupleBootstrap cold start<br/>reconcile(link == linked)"]
    R1 --> K["inherited → re-locked<br/>buyer / All Access → kept"]
    R2 --> K
    R3 --> K
```

---

## 6. Enforcement + dev unlock

```mermaid
flowchart TD
    M{"SUBSCRIPTIONS_ENABLED"}
    M -->|"true (default)"| E["Gates LOCK · paywall enforced"]
    M -->|"false"| T["Testing — all features free"]
    E --> DV["__DEV__ only:<br/>Dev unlock button → devUnlockAll()<br/>grants All Access free for QA"]
```

---

## 7. RevenueCat seam — going live changes one function

```mermaid
flowchart TB
    subgraph Today["Today — local mock"]
        T1["Subscribe"] --> T2["purchasePlans(ids, period)"] --> T3["write settings flags directly"]
    end
    subgraph Prod["Production — RevenueCat"]
        P1["Subscribe"] --> P2["Purchases.purchasePackage(pkg)"]
        P2 --> P3["read customerInfo.entitlements.active"]
        P3 --> P4["map active entitlements → settings flags"]
    end
    T2 -. swap body only .-> P2
```

The read path (`hasEntitlement` / `useEntitlement`), every gate call site, the
flag shape, and the subscription page all stay identical.

---

## 8. File map

```mermaid
flowchart LR
    subgraph state["State"]
        s1["store/settings.ts — flags + migration"]
    end
    subgraph logic["Logic"]
        l1["lib/billing.ts — read / grant / reconcile / purchase"]
        l2["constants/billing.ts — SUBSCRIPTIONS_ENABLED"]
        l3["constants/plans.ts — catalog + prices"]
    end
    subgraph ui["UI"]
        u1["components/PremiumLock.tsx — gateFeature"]
        u2["app/subscription.tsx + components/subscription/*"]
        u3["app/(tabs)/profile.tsx — Subscription row"]
    end
    subgraph couple["Couple"]
        c1["lib/couple.ts"]
        c2["lib/couple.hydration.ts"]
        c3["lib/couple.realtime.ts"]
        c4["lib/coupleBootstrap.ts"]
    end
    u1 --> l1
    u2 --> l1
    u3 --> l1
    l1 --> s1
    l1 --> l2
    u2 --> l3
    c1 --> l1
    c2 --> l1
    c3 --> l1
    c4 --> l1
```
