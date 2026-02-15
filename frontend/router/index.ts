import { createRouter, createWebHistory } from 'vue-router';
import ChatView from '../views/ChatView.vue';
import ThreadsView from '../views/ThreadsView.vue';
import ResourceMapsView from '../views/ResourceMapsView.vue';
import ResourceMapDetailView from '../views/ResourceMapDetailView.vue';
import SettingsView from '../views/SettingsView.vue';
import LoginView from '../views/LoginView.vue';
import SignupView from '../views/SignupView.vue';
import VerifyEmailView from '../views/VerifyEmailView.vue';
import AcceptInviteView from '../views/AcceptInviteView.vue';

const publicRoutes = ['/login', '/signup', '/verify-email', '/resend-verification', '/accept-invite'];

const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    {
      path: '/',
      redirect: '/chat',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { public: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupView,
      meta: { public: true },
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: VerifyEmailView,
      meta: { public: true },
    },
    {
      path: '/accept-invite',
      name: 'accept-invite',
      component: AcceptInviteView,
      meta: { public: true },
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/chat/:id',
      name: 'thread',
      component: ChatView,
    },
    {
      path: '/threads',
      name: 'threads',
      component: ThreadsView,
    },
    {
      path: '/resource-maps',
      name: 'resource-maps',
      component: ResourceMapsView,
    },
    {
      path: '/resource-maps/:id',
      name: 'resource-map-detail',
      component: ResourceMapDetailView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/settings/:tab',
      name: 'settings-tab',
      component: SettingsView,
    },
  ],
});

// Navigation guard
router.beforeEach((to) => {
  const isPublic = to.meta?.public || publicRoutes.includes(to.path);
  const hasToken = !!localStorage.getItem('faultline:token');

  if (!isPublic && !hasToken) {
    return '/login';
  }

  // Redirect authenticated users away from auth pages
  if (isPublic && hasToken && (to.path === '/login' || to.path === '/signup')) {
    return '/chat';
  }
});

export default router;
