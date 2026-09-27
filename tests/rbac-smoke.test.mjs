import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessCompanyInMemberships, hasPermissionInMemberships, hasPlatformPermissionInMemberships } from '../lib/permissions.ts';
import { allowedOrderTransitions, canTransitionOrderStatus } from '../lib/orderWorkflow.ts';

const membership = ({
  roleKey = 'company_manager',
  scope = 'company',
  companyId = 'company-a',
  roleCompanyId = null,
  status = 'active',
  permissions = ['orders.view', 'products.edit'],
} = {}) => ({
  id: 'membership-1',
  user_id: 'user-1',
  role_id: 'role-1',
  company_id: companyId,
  status,
  role: { key: roleKey, name: roleKey, scope_type: scope, company_id: roleCompanyId },
  permissions,
});

test('company memberships cannot cross company scope', () => {
  const memberships = [membership({ companyId: 'company-a' })];
  assert.equal(canAccessCompanyInMemberships(memberships, 'company-a'), true);
  assert.equal(canAccessCompanyInMemberships(memberships, 'company-b'), false);
  assert.equal(hasPermissionInMemberships(memberships, 'products.edit', 'company-a'), true);
  assert.equal(hasPermissionInMemberships(memberships, 'products.edit', 'company-b'), false);
  assert.equal(hasPlatformPermissionInMemberships(memberships, 'orders.view'), false);
});

test('inactive membership grants no access', () => {
  const memberships = [membership({ status: 'suspended' })];
  assert.equal(canAccessCompanyInMemberships(memberships, 'company-a'), false);
  assert.equal(hasPermissionInMemberships(memberships, 'orders.view', 'company-a'), false);
});

test('company-bound custom roles cannot escape their owning company', () => {
  const memberships = [membership({
    roleKey: 'custom_ops',
    companyId: 'company-a',
    roleCompanyId: 'company-a',
    permissions: ['orders.view'],
  })];
  assert.equal(hasPermissionInMemberships(memberships, 'orders.view', 'company-a'), true);
  assert.equal(hasPermissionInMemberships(memberships, 'orders.view', 'company-b'), false);
});

test('platform-scoped membership applies across company scopes', () => {
  const memberships = [membership({
    roleKey: 'platform_admin',
    scope: 'platform',
    companyId: null,
    permissions: ['companies.view'],
  })];
  assert.equal(hasPermissionInMemberships(memberships, 'companies.view'), true);
  assert.equal(hasPermissionInMemberships(memberships, 'companies.view', 'company-a'), true);
  assert.equal(hasPlatformPermissionInMemberships(memberships, 'companies.view'), true);
});

test('platform owner retains platform-wide access', () => {
  const memberships = [membership({
    roleKey: 'platform_owner',
    scope: 'platform',
    companyId: null,
    permissions: ['finance.manage_withdrawals'],
  })];
  assert.equal(canAccessCompanyInMemberships(memberships, 'company-b'), true);
  assert.equal(hasPermissionInMemberships(memberships, 'finance.manage_withdrawals', 'company-b'), true);
  assert.equal(hasPlatformPermissionInMemberships(memberships, 'finance.manage_withdrawals'), true);
});

test('order workflow accepts only documented forward transitions', () => {
  assert.equal(canTransitionOrderStatus('new', 'under_review'), true);
  assert.equal(canTransitionOrderStatus('new', 'cancelled'), true);
  assert.equal(canTransitionOrderStatus('waiting_for_driver', 'out_for_delivery'), true);
  assert.equal(canTransitionOrderStatus('new', 'delivered'), false);
  assert.equal(canTransitionOrderStatus('delivered', 'preparing'), false);
  assert.deepEqual(allowedOrderTransitions('unknown-status'), []);
});
