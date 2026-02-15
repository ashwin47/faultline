class AccountMember < ApplicationRecord
  belongs_to :account
  belongs_to :user

  enum :role, { member: 'member', admin: 'admin', owner: 'owner' }

  validates :role, presence: true
  validates :user_id, uniqueness: { scope: :account_id }

  def admin_or_owner?
    admin? || owner?
  end
end
