class AccountPolicy < ApplicationPolicy
  def member?
    membership.present?
  end

  def admin?
    membership&.admin_or_owner?
  end

  def owner?
    membership&.owner?
  end

  # Workspace actions
  def rename?
    admin?
  end

  def invite_member?
    admin?
  end

  def remove_member?
    admin?
  end

  def cancel_invite?
    admin?
  end

  def update_role?
    owner?
  end
end
