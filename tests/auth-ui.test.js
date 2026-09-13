// Unit tests for assets/js/auth-ui.js. extractCredential/renderSignInButton
// are exercised with a fake `google` object - never the real GIS script -
// so these tests need no network and no real Google account. loadGisScript/
// mountAuthGate's actual <script> injection is integration-level plumbing
// (same category as shell.js!registerServiceWorker) and isn't re-verified
// here beyond "it doesn't throw" - shell.test.js's setupAuthGate tests
// cover the gating logic that calls into mountAuthGate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractCredential, renderSignInButton } from '../assets/js/auth-ui.js';

function makeDom(bodyHtml = '<div id="gsiButtonContainer"></div>') {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

// --- extractCredential -----------------------------------------------------

test('extractCredential() returns the JWT from a well-formed GIS response', () => {
  assert.equal(extractCredential({ credential: 'abc.def.ghi' }), 'abc.def.ghi');
});

test('extractCredential() returns null for a missing/malformed response', () => {
  assert.equal(extractCredential(null), null);
  assert.equal(extractCredential(undefined), null);
  assert.equal(extractCredential({}), null);
  assert.equal(extractCredential({ credential: 42 }), null);
});

// --- renderSignInButton ------------------------------------------------------

test('renderSignInButton() initializes GIS with our CLIENT_ID and renders into the given container', () => {
  const doc = makeDom();
  let initArgs = null;
  let renderArgs = null;
  const fakeGoogle = {
    accounts: {
      id: {
        initialize: (args) => { initArgs = args; },
        renderButton: (container, opts) => { renderArgs = { container, opts }; },
      },
    },
  };

  renderSignInButton({ buttonContainerId: 'gsiButtonContainer', onSignedIn: () => {}, googleImpl: fakeGoogle, doc });

  assert.equal(initArgs.client_id, '778662849882-rcbhu8btlamd3qs45pdgujtdbki20lmo.apps.googleusercontent.com');
  assert.equal(typeof initArgs.callback, 'function');
  assert.equal(renderArgs.container, doc.getElementById('gsiButtonContainer'));
  assert.equal(renderArgs.opts.text, 'signin_with');
});

test('renderSignInButton()\'s callback calls onSignedIn only with a real token, never with a rejected/empty response', () => {
  const doc = makeDom();
  let received = 'não chamado ainda';
  let capturedCallback = null;
  const fakeGoogle = {
    accounts: { id: { initialize: (args) => { capturedCallback = args.callback; }, renderButton: () => {} } },
  };

  renderSignInButton({
    buttonContainerId: 'gsiButtonContainer',
    onSignedIn: (token) => { received = token; },
    googleImpl: fakeGoogle,
    doc,
  });

  capturedCallback({}); // resposta sem credential (ex.: usuário fechou o popup)
  assert.equal(received, 'não chamado ainda');

  capturedCallback({ credential: 'jwt-de-verdade' });
  assert.equal(received, 'jwt-de-verdade');
});

test('renderSignInButton() does nothing (no throw) when the container is missing from the page', () => {
  const doc = makeDom('<div>sem o container certo</div>');
  const fakeGoogle = { accounts: { id: { initialize: () => {}, renderButton: () => { throw new Error('não deveria chegar aqui'); } } } };
  assert.doesNotThrow(() => renderSignInButton({ buttonContainerId: 'gsiButtonContainer', onSignedIn: () => {}, googleImpl: fakeGoogle, doc }));
});

test('renderSignInButton() does nothing (no throw) when googleImpl has no accounts.id yet (script still loading)', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => renderSignInButton({ buttonContainerId: 'gsiButtonContainer', onSignedIn: () => {}, googleImpl: {}, doc }));
  assert.doesNotThrow(() => renderSignInButton({ buttonContainerId: 'gsiButtonContainer', onSignedIn: () => {}, googleImpl: null, doc }));
});
