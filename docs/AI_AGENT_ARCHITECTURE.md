# KalaStyle AI — Agent Architecture

## Overview

The KalaStyle AI Operations Agent is a production-ready, **tool-calling AI agent** built on Google Gemini's function-calling API. It manages the entire KalaStyle AI platform through a controlled, audited tool registry — never executing arbitrary code or SQL.

---

## Architecture Diagram

```
Admin Browser (KalaStyle Admin Panel)
         │
         │  JWT + Admin Role Required
         ▼
[React: AIManagement.js]  ←─── 7 Tabs: Chat | Health | Approvals | Rules | Audit | Queue | Reports
         │
         │  HTTP (HTTPS in prod)
         ▼
[Express API: /api/admin/ai-manager/*]
         │  Rate Limited (agentChatLimiter: 10 req/min/admin)
         │  Auth: protect + admin middleware
         ▼
[aiAdminController.js]
         │
         ▼
[aiOrchestrator.js]  ←── Gemini Tool-Calling Loop (max 8 iterations)
         │
         │  FUNCTION DECLARATIONS ─── Gemini knows these tools only
         ▼
[aiTools.js: FUNCTION_DECLARATIONS]
  ├── 34 Tool declarations (Health, Marketing, Recommendations, Shipping, Approvals, Memory, + original 23)
         │
         │  executeTools() boundary
         ▼
[aiToolExecutor.js]  ←── Permission enforcement + SAFETY_LEVELS
  ├── Level 1: Read-only (get_*, analyze_*, suggest_*, generate_content)
  ├── Level 2: Controlled writes (verify, approve, confirm, send, create_approval_request)
  └── Level 3: High-risk (reject, cancel, delete) — requires admin_confirmed: true
         │
         ▼
Service Layer (all real data, no fabrication):
  ├── artisanService.js         (artisan CRUD)
  ├── productService.js         (product CRUD)
  ├── analyticsReportService.js (business metrics)
  ├── whatsappService.js        (Twilio notifications)
  ├── complaintService.js       (complaint management)
  ├── agentHealthService.js     (NEW: real service checks)
  ├── agentApprovalService.js   (NEW: approval workflow)
  ├── marketingService.js       (NEW: AI campaign generation)
  └── recommendationService.js  (NEW: seasonal recommendations)
         │
         ▼
External Services:
  ├── Supabase (PostgreSQL)     — safeQuery() pattern
  ├── Google Gemini API         — geminiClient.js singleton
  ├── Razorpay                  — payment verification
  ├── Cloudinary                — image storage
  ├── Twilio                    — WhatsApp notifications
  └── Shiprocket                — shipping (graceful stub if unconfigured)
         │
         ▼
Audit Layer (immutable):
  ├── ai_admin_actions          — every tool call logged
  ├── ai_agent_approvals        — approval workflow records
  ├── admin_activity_logs       — human admin actions
  └── ai_usage_logs             — AI API usage tracking
```

---

## Key Design Decisions

### 1. Tool-Calling Pattern (Not Chat Completion)
The agent uses Gemini's **native function calling** — tools are declared as structured schema, and Gemini decides which to call based on the admin's natural language input. This means:
- The agent CANNOT call undeclared tools
- All tool execution passes through `executeTools()` — the security boundary
- Every tool call is validated, rate-checked, and logged

### 2. Safety Levels (3-Tier)
```
Level 1: Read-only     → Always allowed (get_*, analyze_*, suggest_*)
Level 2: Operational   → Allowed with audit log (verify, approve, confirm)
Level 3: High-risk     → Requires admin_confirmed: true in tool args
```

### 3. No Arbitrary SQL
The `safeQuery()` wrapper is the **only** DB access pattern. The AI never generates or executes raw SQL. All queries are pre-written, parameterized Supabase client calls.

### 4. Approval Workflow
When the AI recommends a HIGH/CRITICAL action, it calls `create_approval_request` instead of the destructive tool directly. This creates a record in `ai_agent_approvals` that is visible in the **Approvals tab** of the admin panel. Human admin must click Approve/Reject before any execution proceeds.

### 5. Zero Hallucinations Policy
The system prompt enforces:
- Always read data from DB before acting
- Never claim an action succeeded unless the tool returned `{ success: true }`
- If data is unavailable, say so explicitly

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `ai_admin_actions` | Immutable audit trail of every tool call |
| `ai_action_queue` | Background job queue (event-driven) |
| `ai_admin_conversations` | Chat session storage |
| `ai_automation_rules` | Feature flags for autonomous behaviors |
| `ai_reports` | Generated business intelligence reports |
| `ai_agent_approvals` | *(NEW)* Pending HIGH-risk action approvals |
| `ai_agent_memory` | *(NEW)* Persistent agent operational memory |
| `ai_agent_sessions` | *(NEW)* Session tracking |
| `whatsapp_notifications` | WhatsApp dispatch log |

---

## Security Guarantees

- ✅ JWT + admin role required on every request
- ✅ Rate limited: 10 chat requests/min/admin
- ✅ No arbitrary SQL execution
- ✅ No secrets exposed to model
- ✅ 3-tier safety level system
- ✅ Prompt injection resistance (system prompt instructs agent to treat user text as untrusted data)
- ✅ HIGH-risk ops require explicit admin approval before execution
- ✅ All mutations immutably logged in `ai_admin_actions`
