const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/google-backend.cjs');
test('callback failures explain missing Gmail/Drive consent without exposing provider details',()=>{
 const b=fixture();b.ctx.HtmlService={createHtmlOutput:s=>s};
 for(const [message,code] of [['Gmail access was not approved','GMAIL_PERMISSION_MISSING'],['Approve personal Drive access','DRIVE_PERMISSION_MISSING'],['Choose the same Google account for Gmail authorization','ACCOUNT_MISMATCH'],['Google authorization expired. Reconnect your account.','TOKEN_EXCHANGE_FAILED'],['Authorization expired','STATE_EXPIRED'],['PRIVATE_ACCOUNT_TOKEN','CALLBACK_FAILED']]){
  b.ctx.googleCallback_=()=>{throw Error(message)};
  const html=b.ctx.doGet({parameter:{code:'PRIVATE_AUTHORIZATION_CODE'}});
  assert(html.includes(code));assert(html.includes('name="viewport"'));assert(html.includes('Return to SignWay'));
  assert(!html.includes('PRIVATE_ACCOUNT_TOKEN'));assert(!html.includes('PRIVATE_AUTHORIZATION_CODE'));
 }
});
test('successful callback preserves the single-use handoff and renders a mobile continuation link',()=>{
 const b=fixture();b.ctx.HtmlService={createHtmlOutput:s=>s};
 b.ctx.googleCallback_=()=> 'https://example.com/app#google_handoff=handoff&proof_hash=proof';
 const html=b.ctx.doGet({parameter:{code:'private-code'}});
 assert(html.includes('google_handoff=handoff&amp;proof_hash=proof'));assert(html.includes('Continue to SignWay'));assert(!html.includes('private-code'));
});
