json.conversations @conversations do |conversation|
  json.partial! 'api/agent/conversation_summary', conversation: conversation
end
