import { removeStudentAccount } from '@/lib/admin-remove-user';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const OTHER_ADMIN = '33333333-3333-4333-8333-333333333333';

type Target = { id: string; role: string; email: string | null } | null;

function makeService(opts: {
  target?: Target;
  lookupError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: opts.target ?? null, error: opts.lookupError ?? null });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  const deleteUser = jest.fn().mockResolvedValue({ error: opts.deleteError ?? null });
  return {
    service: { from, auth: { admin: { deleteUser } } },
    from,
    select,
    eq,
    deleteUser,
  };
}

function makeLogClient(opts: { insertThrows?: boolean } = {}) {
  const insert = opts.insertThrows
    ? jest.fn().mockRejectedValue(new Error('log down'))
    : jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn(() => ({ insert }));
  return { logClient: { from }, from, insert };
}

// The helper takes loosely-typed clients; mocks are cast at the boundary.
const run = (
  s: ReturnType<typeof makeService>,
  l: ReturnType<typeof makeLogClient>,
  actorId: string,
  targetUserId: string
) =>
  removeStudentAccount({
    service: s.service as never,
    logClient: l.logClient as never,
    actorId,
    targetUserId,
  });

describe('removeStudentAccount', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  test('refuses to remove yourself, without touching the database', async () => {
    const s = makeService({});
    const l = makeLogClient();
    const res = await run(s, l, ADMIN, ADMIN);
    expect(res).toEqual({
      ok: false,
      status: 400,
      error: 'Admins cannot remove their own account from this endpoint',
    });
    expect(s.from).not.toHaveBeenCalled();
    expect(s.deleteUser).not.toHaveBeenCalled();
    expect(l.insert).not.toHaveBeenCalled();
  });

  test('returns 404 for an unknown user and deletes nothing', async () => {
    const s = makeService({ target: null });
    const l = makeLogClient();
    const res = await run(s, l, ADMIN, STUDENT);
    expect(res).toEqual({ ok: false, status: 404, error: 'User not found' });
    expect(s.deleteUser).not.toHaveBeenCalled();
    expect(l.insert).not.toHaveBeenCalled();
  });

  test('refuses to remove another admin', async () => {
    const s = makeService({ target: { id: OTHER_ADMIN, role: 'admin', email: 'a@x.test' } });
    const l = makeLogClient();
    const res = await run(s, l, ADMIN, OTHER_ADMIN);
    expect(res).toEqual({
      ok: false,
      status: 400,
      error: 'Only student accounts can be removed here',
    });
    expect(s.deleteUser).not.toHaveBeenCalled();
  });

  test('removes a student via the auth admin API and logs it', async () => {
    const s = makeService({ target: { id: STUDENT, role: 'student', email: 'stu@x.test' } });
    const l = makeLogClient();
    const res = await run(s, l, ADMIN, STUDENT);

    expect(res).toEqual({ ok: true, removedId: STUDENT });
    // It looked the profile up by id…
    expect(s.from).toHaveBeenCalledWith('profiles');
    expect(s.eq).toHaveBeenCalledWith('id', STUDENT);
    // …deleted the AUTH user (not just the profiles row)…
    expect(s.deleteUser).toHaveBeenCalledTimes(1);
    expect(s.deleteUser).toHaveBeenCalledWith(STUDENT);
    // …and wrote an audit entry as the admin.
    expect(l.from).toHaveBeenCalledWith('activity_log');
    expect(l.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: ADMIN,
        action: 'user_removed',
        entity_type: 'user',
        entity_id: STUDENT,
      })
    );
  });

  test('a failure writing the audit log does not fail the removal', async () => {
    const s = makeService({ target: { id: STUDENT, role: 'student', email: null } });
    const l = makeLogClient({ insertThrows: true });
    const res = await run(s, l, ADMIN, STUDENT);
    expect(res).toEqual({ ok: true, removedId: STUDENT });
    expect(s.deleteUser).toHaveBeenCalledTimes(1);
  });

  test('a lookup error is a 500 with a generic message (no DB text leaked)', async () => {
    const s = makeService({ lookupError: { message: 'relation "x" secret detail' } });
    const l = makeLogClient();
    const res = await run(s, l, ADMIN, STUDENT);
    expect(res).toEqual({ ok: false, status: 500, error: 'Could not look up that user' });
    expect(s.deleteUser).not.toHaveBeenCalled();
  });

  test('a delete error is a 500, generic, and nothing is logged as removed', async () => {
    const s = makeService({
      target: { id: STUDENT, role: 'student', email: 'stu@x.test' },
      deleteError: { message: 'auth service internal detail' },
    });
    const l = makeLogClient();
    const res = await run(s, l, ADMIN, STUDENT);
    expect(res).toEqual({ ok: false, status: 500, error: 'Could not remove that user' });
    expect(l.insert).not.toHaveBeenCalled();
  });
});
