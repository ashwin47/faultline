# Faultline — Agent Conventions

## Database
- **No database-level foreign keys.** Use Rails associations (`belongs_to`, `has_many`) with `dependent: :destroy` for referential integrity. Do not use `add_foreign_key` in migrations.

## Serialization
- **Never use `render json:` in controllers.** All JSON responses go through jbuilder views in `app/views/<namespace>/<controller>/`.
- For data responses, create a `.json.jbuilder` view matching the action name. Use partials (`_model.json.jbuilder`) for reusable shapes.
- For simple responses, use the helpers from `ApplicationController`:
  - `render_error(message, status:)` → renders `shared/error.json.jbuilder`
  - `render_success` → renders `shared/success.json.jbuilder`
  - `render_message(text)` → renders `shared/message.json.jbuilder`

## Naming — snake_case everywhere in Ruby and Python
- **Never use camelCase in Ruby or Python.** All hash keys, JSON response keys, method names, and variable names must be snake_case.
- The frontend converts automatically at the boundary:
  - **Responses** (snake_case → camelCase): Axios response interceptor in `frontend/lib/axios.ts` uses `camelcase-keys`.
  - **Requests** (camelCase → snake_case): Axios request interceptor converts outgoing bodies with `snakecase-keys`.
  - **WebSocket events**: `frontend/composables/useWebSocket.ts` converts incoming events with `toCamelCase()` and outgoing sends with `toSnakeCase()`.
  - Shared helpers live in `frontend/lib/case-converter.ts`.
- When adding new API endpoints or WebSocket events, just use snake_case on the backend — the frontend conversion layer handles the rest.

## Environment Variables — AppConfig
- **Never read `ENV` directly.** All environment access goes through a centralized config class.
- **Ruby**: `AppConfig` module in `config/app_config.rb` — access via `AppConfig.method_name` (e.g. `AppConfig.redis_url`). Add new env vars as methods here.
- **Python**: `AppConfig` class in `agent_service/agent/config.py` — access via `app_config.field_name` (e.g. `app_config.openai_model`). Add new env vars as fields here.
- Both read from the shared root `.env` file. See `.env.example` for all available variables.
