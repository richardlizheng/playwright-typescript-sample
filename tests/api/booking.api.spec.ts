import { test, expect, type APIRequestContext } from '@playwright/test';
import { env } from '../../utils/env';

// Restful Booker does not always use the usual status codes. These match what the API
// really returns (checked against its docs and live responses):
//   POST /auth           200, even for bad credentials (body has "reason" instead of "token")
//   POST /booking        200, not 201
//   DELETE /booking/:id  201, not 204
test.use({
  baseURL: env.bookerApiUrl,
  extraHTTPHeaders: { Accept: 'application/json' },
});

const booking = {
  firstname: 'Test',
  lastname: 'Guest',
  totalprice: 120,
  depositpaid: true,
  bookingdates: { checkin: '2026-11-01', checkout: '2026-11-03' },
  additionalneeds: 'Breakfast',
};

async function getToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/auth', {
    data: { username: env.bookerUser, password: env.bookerPassword },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token, 'auth should return a token, check BOOKER_USER / BOOKER_PASSWORD').toBeTruthy();
  return body.token;
}

// The same request.post() call can create test data before a UI test, which is faster
// and more reliable than clicking through forms to set things up.
test('booking can be created, read, updated and deleted', { tag: ['@smoke', '@regression'] }, async ({ request }) => {
  const token = await test.step('Get an auth token', () => getToken(request));

  const id = await test.step('Create a booking', async () => {
    const response = await request.post('/booking', { data: booking });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.booking).toEqual(booking);
    return body.bookingid as number;
  });

  await test.step('Read it back', async () => {
    const response = await request.get(`/booking/${id}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(booking);
  });

  await test.step('Update it with the token', async () => {
    const updated = { ...booking, lastname: 'Updated', totalprice: 150 };
    const response = await request.put(`/booking/${id}`, { data: updated, headers: { Cookie: `token=${token}` } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ lastname: 'Updated', totalprice: 150 });
  });

  await test.step('Delete it, then confirm it is gone', async () => {
    const response = await request.delete(`/booking/${id}`, { headers: { Cookie: `token=${token}` } });
    expect(response.status()).toBe(201);
    expect((await request.get(`/booking/${id}`)).status()).toBe(404);
  });
});

test('wrong password gets 200 with a reason, not a token', { tag: ['@regression'] }, async ({ request }) => {
  const response = await request.post('/auth', { data: { username: env.bookerUser, password: 'wrong-password' } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ reason: 'Bad credentials' });
});

test('update without a token is rejected', { tag: ['@regression'] }, async ({ request }) => {
  const created = await request.post('/booking', { data: booking });
  const { bookingid } = await created.json();

  const response = await request.put(`/booking/${bookingid}`, { data: { ...booking, lastname: 'Hacker' } });
  expect(response.status()).toBe(403);

  // Clean up the booking this test created.
  const token = await getToken(request);
  await request.delete(`/booking/${bookingid}`, { headers: { Cookie: `token=${token}` } });
});
