# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_02_18_000003) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"

  create_table "account_members", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.string "role", default: "member", null: false
    t.uuid "user_id", null: false
    t.index ["account_id", "user_id"], name: "index_account_members_on_account_id_and_user_id", unique: true
    t.index ["account_id"], name: "index_account_members_on_account_id"
    t.index ["user_id"], name: "index_account_members_on_user_id"
  end

  create_table "accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_accounts_on_slug", unique: true
  end

  create_table "conversations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.uuid "created_by_user_id"
    t.jsonb "investigation_context"
    t.uuid "resource_map_id"
    t.string "title"
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_conversations_on_account_id"
    t.index ["created_at"], name: "index_conversations_on_created_at"
  end

  create_table "integration_webhooks", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.string "integration", null: false
    t.integer "integration_index", default: 0, null: false
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id", "integration", "integration_index"], name: "idx_webhooks_account_integration_index", unique: true
    t.index ["token"], name: "index_integration_webhooks_on_token", unique: true
  end

  create_table "messages", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "content"
    t.uuid "conversation_id", null: false
    t.datetime "created_at", null: false
    t.jsonb "mentions", default: []
    t.string "message_type", default: "text", null: false
    t.integer "position", null: false
    t.jsonb "reasoning"
    t.string "role", null: false
    t.jsonb "tool_uses"
    t.datetime "updated_at", null: false
    t.uuid "user_id"
    t.index ["conversation_id", "position"], name: "index_messages_on_conversation_id_and_position"
    t.index ["user_id"], name: "index_messages_on_user_id"
  end

  create_table "resource_groups", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.jsonb "node_ids", default: [], null: false
    t.uuid "resource_map_id", null: false
    t.datetime "updated_at", null: false
    t.index ["resource_map_id"], name: "index_resource_groups_on_resource_map_id"
  end

  create_table "resource_maps", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.text "description"
    t.jsonb "edges", default: [], null: false
    t.datetime "last_synced_at"
    t.string "name", null: false
    t.jsonb "nodes", default: [], null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_resource_maps_on_account_id"
  end

  create_table "sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.datetime "last_active_at"
    t.string "user_agent"
    t.uuid "user_id", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "settings", force: :cascade do |t|
    t.uuid "account_id", null: false
    t.string "key", null: false
    t.datetime "updated_at"
    t.text "value", null: false
    t.index ["account_id", "key"], name: "index_settings_on_account_id_and_key", unique: true
    t.index ["account_id"], name: "index_settings_on_account_id"
  end

  create_table "system_kvs", primary_key: "key", id: :string, force: :cascade do |t|
    t.string "value", null: false
  end

  create_table "tool_executions", force: :cascade do |t|
    t.uuid "conversation_id"
    t.text "error_message"
    t.datetime "executed_at"
    t.integer "execution_time_ms"
    t.jsonb "input_params", default: {}, null: false
    t.jsonb "output_result"
    t.string "status", null: false
    t.string "tool_name", null: false
    t.index ["conversation_id"], name: "index_tool_executions_on_conversation_id"
    t.index ["tool_name"], name: "index_tool_executions_on_tool_name"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.datetime "email_verification_expires_at"
    t.string "email_verification_token"
    t.boolean "email_verified", default: false
    t.string "encrypted_password", null: false
    t.string "jti", null: false
    t.uuid "last_active_account_id"
    t.string "name", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["email_verification_token"], name: "index_users_on_email_verification_token", unique: true
    t.index ["jti"], name: "index_users_on_jti", unique: true
  end

  create_table "workspace_invites", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.datetime "expires_at", null: false
    t.uuid "invited_by_user_id", null: false
    t.string "role", null: false
    t.string "status", default: "pending", null: false
    t.string "token", null: false
    t.index ["account_id"], name: "index_workspace_invites_on_account_id"
    t.index ["token"], name: "index_workspace_invites_on_token", unique: true
  end

  add_foreign_key "account_members", "accounts"
  add_foreign_key "account_members", "users"
  add_foreign_key "conversations", "accounts"
  add_foreign_key "conversations", "resource_maps"
  add_foreign_key "conversations", "users", column: "created_by_user_id"
  add_foreign_key "resource_maps", "accounts"
  add_foreign_key "sessions", "users"
  add_foreign_key "settings", "accounts"
  add_foreign_key "tool_executions", "conversations"
  add_foreign_key "workspace_invites", "accounts"
  add_foreign_key "workspace_invites", "users", column: "invited_by_user_id"
end
