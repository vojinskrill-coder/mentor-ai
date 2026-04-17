# Mentor AI Bridge Skill

## Purpose
This skill connects OpenClaw agents to the Neuron OS backend.
All state reads and writes go through this bridge.

## Configuration
- Backend URL: {{BACKEND_URL}}
- Auth Token: {{BRIDGE_AUTH_TOKEN}}
- Tenant ID: {{TENANT_ID}}

## Available Operations

### Read State
```
GET {{BACKEND_URL}}/api/bridge/state?tenantId={{TENANT_ID}}
Authorization: Bearer {{BRIDGE_AUTH_TOKEN}}
```

### Write State
```
POST {{BACKEND_URL}}/api/bridge/state
Authorization: Bearer {{BRIDGE_AUTH_TOKEN}}
Content-Type: application/json

{
  "tenantId": "{{TENANT_ID}}",
  "key": "<state-key>",
  "value": "<state-value>"
}
```

### Task Complete
```
POST {{BACKEND_URL}}/api/bridge/task-complete
Authorization: Bearer {{BRIDGE_AUTH_TOKEN}}
Content-Type: application/json

{
  "tenantId": "{{TENANT_ID}}",
  "taskId": "<task-id>",
  "result": "<result-data>"
}
```

### Knowledge Search
```
POST {{BACKEND_URL}}/api/bridge/knowledge/search
Authorization: Bearer {{BRIDGE_AUTH_TOKEN}}
Content-Type: application/json

{
  "tenantId": "{{TENANT_ID}}",
  "query": "<search-query>",
  "limit": 5
}
```

## Error Handling
- On 401: Token expired, agent should report auth failure
- On 404: Resource not found, skip and continue
- On 500: Retry up to 3 times with exponential backoff
