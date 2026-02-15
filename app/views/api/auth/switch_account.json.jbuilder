json.account do
  json.id @account.id
  json.name @account.name
  json.slug @account.slug
  json.role @role
end
json.role @role
json.token @token
