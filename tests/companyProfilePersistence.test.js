import test from 'node:test';
import assert from 'node:assert/strict';

import { upsertCompanyProfile } from '../src/services/authService.js';

test('upsertCompanyProfile syncs profile metadata back to the company record used by the sidebar', async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (sql.includes('SELECT 1 FROM company_users')) {
        return { rowCount: 1, rows: [{ exists: true }] };
      }

      if (sql.includes('INSERT INTO company_profiles')) {
        return {
          rows: [{
            companyId: 7,
            companyName: 'Acme Solutions',
            constitution: 'Proprietorship',
            kyc: 'CIN',
            kycValue: 'U65999MH2024PTC123456',
            email: 'owner@acme.test',
            contactNumber: '9999999999',
            state: 'Maharashtra',
            city: 'Mumbai',
            businessType: 'Trader',
            productType: 'Rice'
          }]
        };
      }

      return { rowCount: 0, rows: [] };
    }
  };

  const result = await upsertCompanyProfile({
    userId: 'usr_123',
    companyId: 7,
    profile: {
      companyName: 'Acme Solutions',
      kyc: 'CIN',
      kycValue: 'U65999MH2024PTC123456',
      email: 'owner@acme.test',
      contactNumber: '9999999999',
      state: 'Maharashtra',
      city: 'Mumbai',
      businessType: 'Trader',
      productType: 'Rice'
    }
  }, db);

  assert.equal(result.companyName, 'Acme Solutions');

  const companyUpdate = calls.find(({ sql }) => sql.includes('UPDATE public.companies'));
  assert.ok(companyUpdate, 'Expected company metadata to be synced back to the companies table.');
  assert.equal(companyUpdate.params[0], 7);
  assert.equal(companyUpdate.params[1], 'Acme Solutions');
  assert.equal(companyUpdate.params[2], 'U65999MH2024PTC123456');
  assert.equal(companyUpdate.params[3], null);
  assert.equal(companyUpdate.params[4], 'ACME SOLUTIONS');
});
