class ResourceGroup < ApplicationRecord
  belongs_to :resource_map, touch: true

  validates :name, presence: true
end
