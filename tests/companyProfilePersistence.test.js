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

      if (sql.includes('UPDATE public.companies')) {
        return {
          rows: [{ id: 7, company_name: 'Acme Solutions', cin: 'U65999MH2024PTC123456', pan: '' }]
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
  assert.equal(result.cin, 'U65999MH2024PTC123456');
  assert.equal(result.pan, '');

  const companyUpdate = calls.find(({ sql }) => sql.includes('UPDATE public.companies'));
  assert.ok(companyUpdate, 'Expected company metadata to be synced back to the companies table.');
  assert.equal(companyUpdate.params[0], 7);
  assert.equal(companyUpdate.params[1], 'Acme Solutions');
  assert.equal(companyUpdate.params[2], 'U65999MH2024PTC123456');
  assert.equal(companyUpdate.params[3], '');
  assert.equal(companyUpdate.params[4], 'ACME SOLUTIONS');
});

test('upsertCompanyProfile accepts blank optional fields and clears stale values', async () => {
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
            companyName: '',
            constitution: 'Proprietorship',
            kyc: 'PAN',
            kycValue: '',
            email: '',
            contactNumber: '',
            state: '',
            city: '',
            businessType: 'Trader',
            productType: ''
          }]
        };
      }

      return { rowCount: 0, rows: [] };
    }
  };

  await upsertCompanyProfile({
    userId: 'usr_456',
    companyId: 7,
    profile: {
      companyName: '',
      constitution: 'Proprietorship',
      kyc: 'PAN',
      kycValue: '',
      email: '',
      contactNumber: '',
      state: '',
      city: '',
      businessType: 'Trader',
      productType: ''
    }
  }, db);

  const companyUpdate = calls.find(({ sql }) => sql.includes('UPDATE public.companies'));
  assert.ok(companyUpdate, 'Expected company metadata sync even when fields are blank.');
  assert.equal(companyUpdate.params[1], '');
  assert.equal(companyUpdate.params[4], '');
});

test('upsertCompanyProfile removes an unreferenced duplicate company before changing CIN', async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (sql.includes('SELECT 1 FROM company_users')) {
        return { rowCount: 1, rows: [{ exists: true }] };
      }

      if (sql.includes('WHERE c.cin = $1 AND c.id <> $2')) {
        return { rowCount: 1, rows: [{ id: 3, member_count: 0, document_count: 0, profile_count: 0 }] };
      }

      if (sql.includes('INSERT INTO company_profiles')) {
        return { rows: [{ companyId: 22, companyName: 'Dynamic', kyc: 'CIN', kycValue: 'L31300RJ2007PLC024139' }] };
      }

      if (sql.includes('UPDATE public.companies')) {
        return { rows: [{ id: 22, company_name: 'Dynamic', cin: 'L31300RJ2007PLC024139', pan: '' }] };
      }

      return { rowCount: 0, rows: [] };
    }
  };

  const result = await upsertCompanyProfile({
    userId: 'usr_123',
    companyId: 22,
    profile: {
      companyName: 'Dynamic',
      kyc: 'CIN',
      kycValue: 'L31300RJ2007PLC024139'
    }
  }, db);

  assert.equal(result.cin, 'L31300RJ2007PLC024139');
  assert.ok(calls.some(({ sql, params }) => sql.includes('DELETE FROM public.companies') && params[0] === 3));
});

test('upsertCompanyProfile rejects a CIN assigned to a referenced company', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('SELECT 1 FROM company_users')) {
        return { rowCount: 1, rows: [{ exists: true }] };
      }

      if (sql.includes('WHERE c.cin = $1 AND c.id <> $2')) {
        return { rowCount: 1, rows: [{ id: 3, company_name: 'Existing Company', member_count: 1, document_count: 0, profile_count: 1 }] };
      }

      return { rowCount: 0, rows: [] };
    }
  };

  await assert.rejects(
    upsertCompanyProfile({
      userId: 'usr_123',
      companyId: 22,
      profile: { companyName: 'Dynamic', kyc: 'CIN', kycValue: 'L31300RJ2007PLC024139' }
    }, db),
    error => error.code === 'COMPANY_CIN_CONFLICT'
      && error.message === 'This CIN is being used by another company. Please enter your own CIN.'
  );
});
