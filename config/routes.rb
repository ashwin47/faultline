Rails.application.routes.draw do
  # Devise (skip all default routes — we use custom API controllers)
  devise_for :users, skip: :all

  # Health check
  get 'api/health', to: proc { [200, { 'Content-Type' => 'application/json' }, ['{"status":"ok"}']] }

  namespace :api do
    # Webhooks (unauthenticated — token-based)
    post 'webhooks/pagerduty/:token', to: 'webhooks#pagerduty'

    # Auth routes (public — no account scope)
    scope 'auth', controller: :auth do
      post 'signup'
      post 'login'
      post 'logout'
      get 'me'
      get 'verify-email', action: :verify_email
      post 'switch-account', action: :switch_account
      post 'resend-verification', action: :resend_verification
      get 'sessions', action: :sessions
      delete 'sessions/:id', action: :destroy_session
    end

    # Accept invite (not account-scoped)
    post 'invites/accept', to: 'workspace#accept_invite'

    # Account-scoped routes
    scope 'accounts/:account_id' do
      # Agent / conversations
      get 'agent/conversations', to: 'agent#index'
      get 'agent/conversations/:id', to: 'agent#show'
      delete 'agent/conversations/:id', to: 'agent#destroy'
      get 'agent/models', to: 'agent#models'

      # Settings
      get 'settings', to: 'settings#index'
      put 'settings', to: 'settings#update'
      get 'settings/status', to: 'settings#status'
      post 'settings/test/:integration', to: 'settings#test_connection'
      delete 'settings/integration/:integration/:index', to: 'settings#destroy_integration'

      # Resource maps
      resources :resource_maps, path: 'resource-maps', only: %i[index create show update destroy] do
        member do
          post :sync
          put :graph
        end
      end

      # Workspace
      get 'members', to: 'workspace#members'
      post 'invites', to: 'workspace#create_invite'
      delete 'invites/:invite_id', to: 'workspace#cancel_invite'
      delete 'members/:user_id', to: 'workspace#remove_member'
      patch 'members/:user_id/role', to: 'workspace#update_role'
      put 'rename', to: 'workspace#rename'
    end
  end

  # Mount Sidekiq web UI in development
  if Rails.env.development?
    require 'sidekiq/web'
    mount Sidekiq::Web => '/sidekiq'
  end

  # SPA catch-all — must be last
  get '*path', to: 'spa#index', constraints: ->(req) { !req.path.start_with?('/api/', '/cable', '/sidekiq') }
  root 'spa#index'
end
