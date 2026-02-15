json.user do
  json.id @user.id
  json.email @user.email
  json.name @user.name
end
json.account @current_account
json.accounts @accounts
json.pending_invites @pending_invites
