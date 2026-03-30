const https = require('https');
const http = require('http');

const GEMINI_KEY = 'AIzaSyAFnHO8yylkLc-F0kM875FzukBTG97Sgyw';
const BRAVE_KEY = 'BSAj-sqDb_glTAOX76te_-RrzgWPP-u';
const RELAY_TOKEN = '9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d';

let totalGeminiCost = 0;
let totalBraveQueries = 0;

function fetchJSON(url, options) {
  return new Promise(function(resolve, reject) {
    var mod = url.startsWith('https') ? https : http;
    var req = mod.request(url, options, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse: ' + data.substring(0, 300))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(600000, function() { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function fetchGet(url, headers) {
  return new Promise(function(resolve, reject) {
    var req = https.get(url, { headers: headers }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function geminiCall(prompt, label) {
  var start = Date.now();
  var model = 'gemini-2.5-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GEMINI_KEY;
  var data = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(label === 'summarize' ? {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } },
    } : {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 5000 },
    }),
  });
  var ms = Date.now() - start;
  if (data.error) {
    console.log('  [Gemini ' + label + '] ERROR: ' + data.error.message);
    return '';
  }
  var text = (data.candidates && data.candidates[0] && data.candidates[0].content)
    ? data.candidates[0].content.parts[0].text : '';
  var u = data.usageMetadata || {};
  var cost = (u.promptTokenCount || 0) / 1e6 * 0.30 + (u.candidatesTokenCount || 0) / 1e6 * 2.50;
  totalGeminiCost += cost;
  console.log('  [Gemini ' + label + '] ' + ms + 'ms | in:' + u.promptTokenCount + ' out:' + u.candidatesTokenCount + ' think:' + (u.thoughtsTokenCount||0) + ' | $' + cost.toFixed(6) + ' | ' + text.length + 'ch');
  return text;
}

async function braveSearch(query) {
  var start = Date.now();
  var encoded = encodeURIComponent(query);
  var data = await fetchGet(
    'https://api.search.brave.com/res/v1/web/search?q=' + encoded + '&count=5',
    { 'X-Subscription-Token': BRAVE_KEY, 'Accept': 'application/json' }
  );
  totalBraveQueries++;
  var results = (data.web && data.web.results || []).slice(0, 5).map(function(r) {
    return { title: r.title || '', link: r.url || '', snippet: r.description || '' };
  });
  console.log('  [Brave] "' + query.substring(0, 50) + '..." ' + (Date.now() - start) + 'ms | ' + results.length + ' results');
  return results;
}

async function openclawAgent(agentId, message, sessionId) {
  var start = Date.now();
  var data = await fetchJSON('http://127.0.0.1:3100/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + RELAY_TOKEN },
    body: JSON.stringify({ message: message, agentId: agentId, sessionId: sessionId, timeoutSeconds: 300 }),
  });
  var ms = Date.now() - start;
  var output = data.output || '';
  console.log('  [DeepSeek ' + agentId + '] ' + ms + 'ms | ' + output.length + 'ch | success:' + data.success);
  return { output: output, ms: ms, success: data.success };
}

async function runConcept(num, agentId, agentLabel, taskTitle, taskPrompt, prevContext) {
  console.log('\n>>> C' + num + ': ' + agentLabel + ' - "' + taskTitle + '"');
  var cStart = Date.now();

  var fullPrompt = prevContext
    ? taskPrompt + '\n\n--- PRETHODNI REZULTATI ---\n' + prevContext + '\n--- KRAJ ---'
    : taskPrompt;

  // Step 1: Gemini generates search queries
  var queryText = await geminiCall(
    'Generate 5 concise English search queries (each under 8 words) to find data for this task. Return ONLY a JSON array of strings.\n\nTASK: ' + fullPrompt.substring(0, 2000),
    'queries'
  );

  var queries;
  try {
    var match = queryText.match(/\[[\s\S]*\]/);
    queries = match ? JSON.parse(match[0]) : [];
  } catch(e) { queries = [taskTitle + ' benchmarks']; }
  console.log('  Queries: ' + queries.length + ' - ' + queries.map(function(q) { return q.substring(0, 35); }).join(' | '));

  // Step 2: Brave searches (4 queries)
  var rawResearch = '';
  for (var i = 0; i < Math.min(queries.length, 4); i++) {
    var results = await braveSearch(queries[i]);
    for (var j = 0; j < results.length; j++) {
      var r = results[j];
      rawResearch += '**[' + r.title + '](' + r.link + ')**\n' + r.snippet + '\n\n';
    }
  }
  console.log('  Raw research: ' + rawResearch.length + 'ch');

  // Step 3: Gemini summarizes if needed
  var research = rawResearch;
  if (rawResearch.length > 5000) {
    research = await geminiCall(
      'Summarize this web research into approximately 5000 characters (not less than 4000). PRESERVE all specific numbers, percentages, currency amounts, URLs, benchmarks, competitor names and data. REMOVE only duplicate info and generic filler. Serbian language. Use markdown tables where data comparison exists.\n\n' + rawResearch,
      'summarize'
    );
  }
  console.log('  Final research: ' + research.length + 'ch');

  // Step 4: DeepSeek domain agent
  var enrichedPrompt = fullPrompt + '\n\n--- REZULTATI WEB ISTRAZIVANJA ---\nKoristi ove podatke kao PRIMARNI izvor. Citiraj svaki izvor ([Naziv](URL)). NE izmisljaj podatke.\n\n' + research + '\n--- KRAJ WEB ISTRAZIVANJA ---\nSve na srpskom jeziku. Markdown, tabele, ## zaglavlja.';
  var result = await openclawAgent(agentId, enrichedPrompt, 'hybrid-c' + num + '-' + agentId);

  var total = Date.now() - cStart;
  console.log('  TOTAL C' + num + ': ' + (total / 1000).toFixed(1) + 's | output: ' + result.output.length + 'ch');
  return result.output;
}

async function main() {
  console.log('============================================');
  console.log('HYBRID PIPELINE: Gemini Flash + Brave + DeepSeek');
  console.log('Start: ' + new Date().toISOString());
  console.log('============================================');

  var totalStart = Date.now();

  var c1 = await runConcept(1, 'financial', 'Finansijska analiza',
    'Value Stream Mapping za luksuznu proizvodnju',
    'Analiziraj finansijske aspekte Value Stream Mapping-a za Luxury Statues Adria. Bronze/marble skulpture, SE Europe, HNW klijenti. Varijansa materijala 28.5%, CCC 180-240 dana, prihod 500K EUR. Izracunaj ROI, break-even, scenarije.',
    ''
  );

  var c2 = await runConcept(2, 'marketing', 'Marketing analiza',
    'Predvidljivost kao luksuzna vrednost brenda',
    'Marketing strategija za predvidljivost kao luksuznu vrednost. Luxury Statues Adria. SWOT analiza, pozicioniranje, KPI-evi.',
    c1.substring(0, 2000)
  );

  var c3 = await runConcept(3, 'sales', 'Prodajna strategija',
    'Izgradnja poverenja u luksuznom B2B',
    'Prodajna strategija za izgradnju poverenja. Luxury Statues Adria, skulpture 20K-200K EUR. Talk tracks, objection handling, pricing.',
    c1.substring(0, 1500) + '\n\n' + c2.substring(0, 1500)
  );

  var totalMs = Date.now() - totalStart;
  console.log('\n============================================');
  console.log('COMPLETE: ' + new Date().toISOString());
  console.log('TOTAL TIME: ' + (totalMs / 1000).toFixed(1) + 's');
  console.log('Gemini cost (PAID): $' + totalGeminiCost.toFixed(6));
  console.log('Gemini cost (FREE tier): $0.00');
  console.log('Brave queries: ' + totalBraveQueries + ' of 1000/month free');
  console.log('DeepSeek: ~$0.02 estimate');
  console.log('============================================');

  console.log('\n=== C1 PREVIEW (500ch) ===');
  console.log(c1.substring(0, 500));
  console.log('\n=== C2 PREVIEW (500ch) ===');
  console.log(c2.substring(0, 500));
  console.log('\n=== C3 PREVIEW (500ch) ===');
  console.log(c3.substring(0, 500));
}

main().catch(function(e) { console.error('FATAL:', e.message); });
