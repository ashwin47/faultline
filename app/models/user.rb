class User < ApplicationRecord
  include Devise::JWT::RevocationStrategies::JTIMatcher

  devise :database_authenticatable, :registerable, :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: self

  has_many :account_members, dependent: :destroy
  has_many :accounts, through: :account_members
  has_many :sessions, dependent: :destroy

  validates :name, presence: true

  def jwt_payload
    super.merge(
      'account_id' => last_active_account_id
    )
  end
end
