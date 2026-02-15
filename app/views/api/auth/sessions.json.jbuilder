json.sessions @sessions do |session|
  json.id session.id
  json.ip_address session.ip_address
  json.user_agent session.user_agent
  json.last_active_at session.last_active_at
  json.created_at session.created_at
end
