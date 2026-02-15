class ApplicationPolicy
  attr_reader :context, :record

  # context is a struct with user and account_member
  def initialize(context, record)
    @context = context
    @record = record
  end

  delegate :user, to: :context

  delegate :membership, to: :context

  def index?
    true
  end

  def show?
    true
  end

  def create?
    false
  end

  def update?
    false
  end

  def destroy?
    false
  end
end
