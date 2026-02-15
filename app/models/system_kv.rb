class SystemKV < ApplicationRecord
  self.primary_key = :key

  validates :key, presence: true, uniqueness: true
  validates :value, presence: true
end
