// jest.mock() must be written before the imports it affects — ts-jest
// (unlike babel-jest) does not hoist jest.mock() calls above import
// statements, so source order is execution order here.
jest.mock('@/lib/supabase-server', () => {
  const actual = jest.requireActual('@/lib/supabase-server');
  return {
    ...actual,
    createRouteHandlerClient: jest.fn(),
  };
});

import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import { GET as subjectsGet, POST as subjectsPost } from '@/app/api/admin/content/subjects/route';
import {
  supabaseTestEnvAvailable,
  getServiceRoleClient,
  getAnonClient,
  createTestUser,
  deleteTestUser,
  signInTestUser,
  uniqueSlug,
  type TestUser,
} from '../helpers/supabase-test-env';

const mockCreateRouteHandlerClient = createRouteHandlerClient as jest.MockedFunction<
  typeof createRouteHandlerClient
>;

const describeIfSupabase = supabaseTestEnvAvailable() ? describe : describe.skip;

/**
 * requireAdmin() (lib/require-admin.ts) obtains its Supabase client via
 * createRouteHandlerClient(), which calls next/headers' cookies() —
 * unusable outside a live Next.js request. Mocking just that one function
 * to inject a real, already-authenticated (or deliberately unauthenticated)
 * client lets these tests call the real exported route handlers directly,
 * against the real database, without a running dev server. Only the
 * Next.js plumbing is mocked here — Supabase's own behavior never is.
 *
 * Covers one GET-only ported route (admin/content/subjects GET) and one
 * write route (admin/content/subjects POST), per the "at least one of
 * each, not all 14" scope.
 */
describeIfSupabase('requireAdmin auth gating', () => {
  const admin = getServiceRoleClient();
  let studentUser: TestUser;
  let adminUser: TestUser;
  const createdSubjectIds: string[] = [];

  beforeEach(async () => {
    studentUser = await createTestUser(admin, 'student');
    adminUser = await createTestUser(admin, 'admin');
  });

  afterEach(async () => {
    if (createdSubjectIds.length > 0) {
      await admin.from('subjects').delete().in('id', createdSubjectIds);
      createdSubjectIds.length = 0;
    }
    await deleteTestUser(admin, studentUser.id);
    await deleteTestUser(admin, adminUser.id);
  });

  test('GET rejects an unauthenticated request with 401', async () => {
    mockCreateRouteHandlerClient.mockResolvedValueOnce(getAnonClient() as SupabaseClient<any>);
    const res = await subjectsGet();
    expect(res.status).toBe(401);
  });

  test('GET rejects a non-admin (student) request with 403', async () => {
    const client = await signInTestUser(studentUser.email, studentUser.password);
    mockCreateRouteHandlerClient.mockResolvedValueOnce(client as SupabaseClient<any>);
    const res = await subjectsGet();
    expect(res.status).toBe(403);
  });

  test('GET allows an admin request with 200', async () => {
    const client = await signInTestUser(adminUser.email, adminUser.password);
    mockCreateRouteHandlerClient.mockResolvedValueOnce(client as SupabaseClient<any>);
    const res = await subjectsGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.subjects)).toBe(true);
  });

  function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/admin/content/subjects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  test('POST (write route) rejects an unauthenticated request with 401', async () => {
    mockCreateRouteHandlerClient.mockResolvedValueOnce(getAnonClient() as SupabaseClient<any>);
    const res = await subjectsPost(postRequest({ name: uniqueSlug('should-not-be-created') }));
    expect(res.status).toBe(401);
  });

  test('POST (write route) rejects a non-admin (student) request with 403', async () => {
    const client = await signInTestUser(studentUser.email, studentUser.password);
    mockCreateRouteHandlerClient.mockResolvedValueOnce(client as SupabaseClient<any>);
    const res = await subjectsPost(postRequest({ name: uniqueSlug('should-not-be-created') }));
    expect(res.status).toBe(403);
  });

  test('POST (write route) allows an admin request and creates the row', async () => {
    const client = await signInTestUser(adminUser.email, adminUser.password);
    mockCreateRouteHandlerClient.mockResolvedValueOnce(client as SupabaseClient<any>);
    const name = uniqueSlug('gated-write');
    const res = await subjectsPost(postRequest({ name }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subject.name).toBe(name);
    createdSubjectIds.push(body.subject.id);
  });
});
