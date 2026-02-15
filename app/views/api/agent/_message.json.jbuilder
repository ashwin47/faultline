json.id message.id
json.role message.role
json.message_type message.message_type
json.content message.content
json.created_at message.created_at
json.tool_uses message.tool_uses if message.tool_uses.present?
json.reasoning message.reasoning if message.reasoning.present?
json.user_id message.user_id if message.user_id.present?
json.mentions message.mentions if message.mentions.present?
