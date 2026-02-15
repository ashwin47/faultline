class MigrateMessagesFromJsonb < ActiveRecord::Migration[8.1]
  def up
    # Migrate existing JSONB messages to the new messages table
    execute <<~SQL
      INSERT INTO messages (id, conversation_id, role, content, tool_uses, reasoning, position, created_at, updated_at)
      SELECT
        COALESCE((elem->>'id')::uuid, gen_random_uuid()),
        conversations.id,
        elem->>'role',
        COALESCE(elem->>'content', ''),
        CASE WHEN elem->'toolUses' IS NOT NULL AND elem->>'toolUses' != 'null'
             THEN elem->'toolUses'
             ELSE NULL END,
        CASE WHEN elem->'reasoning' IS NOT NULL AND elem->>'reasoning' != 'null'
             THEN elem->'reasoning'
             ELSE NULL END,
        (row_number() OVER (PARTITION BY conversations.id ORDER BY ordinality)) - 1,
        COALESCE((elem->>'timestamp')::timestamptz, conversations.created_at),
        COALESCE((elem->>'timestamp')::timestamptz, conversations.created_at)
      FROM conversations,
           jsonb_array_elements(conversations.messages) WITH ORDINALITY AS t(elem, ordinality)
      WHERE jsonb_array_length(conversations.messages) > 0
    SQL

    remove_column :conversations, :messages
  end

  def down
    add_column :conversations, :messages, :jsonb, null: false, default: []

    # Migrate messages back to JSONB
    execute <<~SQL
      UPDATE conversations
      SET messages = (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', m.id,
              'role', m.role,
              'content', m.content,
              'timestamp', m.created_at,
              'toolUses', m.tool_uses,
              'reasoning', m.reasoning
            ) ORDER BY m.position
          ),
          '[]'::jsonb
        )
        FROM messages m
        WHERE m.conversation_id = conversations.id
      )
    SQL

    execute 'DELETE FROM messages'
  end
end
