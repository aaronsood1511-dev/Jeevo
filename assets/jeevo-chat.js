/* Jeevo trip planner — guided, runs entirely in the browser.
   Matches the visitor to one of Jeevo's real itineraries using the real
   routes and drive times, then hands the lead to the existing enquiry
   endpoint. No API, no key, no per-message cost. */
(function () {
  'use strict';

  var DATA_URL = 'ai/planner-data.json';
  var ENQUIRY  = '/api/enquiry';
  var STORE    = 'jeevo_plan_v1';

  var answers = {}, step = 0, el = {}, resumedMode = null;

  /* The visitor's chosen language. Labels are looked up; the values sent to
     the backend stay English so enquiries arrive readable either way. */
  function T(k, fb){ return (window.jvT ? window.jvT(k, fb) : fb); }

  var STEPS = [
    { key:'region', q:'chat.q.region',
      opts:[ ['chat.o.raj','Rajasthan'], ['chat.o.south','South India'],
             ['chat.o.goa','Goa'], ['chat.o.ladakh','Ladakh & the Himalaya'],
             ['chat.o.ne','North East India'],
             ['chat.o.triangle','Rajasthan'], ['chat.o.east','East India'],
             ['chat.o.nepal','India & Nepal'], ['chat.o.vietnam','Vietnam'],
             ['chat.o.unsure',''] ] },
    { key:'nights', q:'chat.q.nights',
      opts:[ ['chat.o.n5','5'], ['chat.o.n7','7'], ['chat.o.n14','14'],
             ['chat.o.n19','19'], ['chat.o.nx',''] ] },
    { key:'party', q:'chat.q.party',
      opts:[ ['chat.o.p2','2 adults'], ['chat.o.p1','1 adult'],
             ['chat.o.pfam','family'], ['chat.o.pfri','group'],
             ['chat.o.plrg','large group'] ] },
    { key:'hotel', q:'chat.q.hotel',
      opts:[ ['chat.o.h3','3-star – comfortable'],
             ['chat.o.h4','4-star – premium'],
             ['chat.o.h5','5-star – luxury'],
             ['chat.o.hher','Heritage / palace stays'],
             ['chat.o.hany',''] ] },
    { key:'budget', q:'chat.q.budget',
      opts:[ ['chat.o.b1','Under $2,000'], ['chat.o.b2','$2,000 – $3,500'],
             ['chat.o.b3','$3,500 – $5,000'], ['chat.o.b4','$5,000 – $8,000'],
             ['chat.o.b5','$8,000+'], ['chat.o.bx',''] ] },
  ];
  /* The widget is on every page, so a visitor who chats on the homepage
     and then opens a tour page would otherwise lose the conversation.
     Keep the last 20 turns for the browser session. */
  function save(){
    try{ sessionStorage.setItem(STORE, JSON.stringify({
      answers:answers, step:step, history:history.slice(-20), mode: botOff ? 'guided' : 'chat'
    })); }catch(e){}
  }
  function load(){
    try{
      var r=sessionStorage.getItem(STORE); if(!r) return;
      var st=JSON.parse(r)||{};
      answers=st.answers||{}; step=st.step||0; history=st.history||[];
      resumedMode = st.mode || null;
    }catch(e){}
  }

  function build(){
    var fab = document.createElement('button');
    fab.className='jv-chat-fab'; fab.type='button';
    fab.setAttribute('aria-label','Plan a trip with Arjun');
    fab.innerHTML='<i class="fas fa-route" aria-hidden="true"></i><span data-i18n="chat.fab">Plan my trip</span>';

    var panel=document.createElement('div');
    panel.className='jv-chat-panel'; panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Plan your trip');
    panel.innerHTML=
      '<div class="jv-chat-head">'+
        '<div><h3>Plan with Arjun</h3><p>Your trip planner at Jeevo</p></div>'+
        '<button class="jv-chat-close" type="button" aria-label="Close">&times;</button>'+
      '</div>'+
      '<div class="jv-chat-log" role="log" aria-live="polite"></div>'+
      '<div class="jv-chat-foot"><div class="jv-chat-opts"></div>'+
        '<div class="jv-chat-row" hidden>'+
          '<textarea class="jv-chat-input" rows="1" placeholder="Or just tell me what you\'re after\u2026" data-i18n-ph="ph.chat" maxlength="1200" aria-label="Your message"></textarea>'+
          '<button class="jv-chat-send" type="button" aria-label="Send"><i class="fas fa-paper-plane" aria-hidden="true"></i></button>'+
        '</div>'+
        '<p class="jv-chat-note">Suggestions come from trips we actually run. A consultant confirms details and pricing.</p>'+
      '</div>';

    document.body.appendChild(fab); document.body.appendChild(panel);
    el.fab=fab; el.panel=panel;
    el.log=panel.querySelector('.jv-chat-log');
    el.opts=panel.querySelector('.jv-chat-opts');
    el.close=panel.querySelector('.jv-chat-close');
    el.row=panel.querySelector('.jv-chat-row');
    el.input=panel.querySelector('.jv-chat-input');
    el.send=panel.querySelector('.jv-chat-send');
  }

  /* Arjun's replies arrive whole, and a paragraph appearing in one lump
     reads as a machine answering rather than a person writing. This lets
     it in a word at a time, with a longer beat after punctuation so the
     rhythm is not metronomic.

     Anyone who has asked for reduced motion gets the whole thing at once,
     and so does a long reply, where watching it type would be tedious. */
  /* Reveal the reply as it would be written rather than dropping it whole.

     The length test used to count the pieces of split(/(\s+)/), which keeps
     the separators and so yields about two per word - a 120-word reply
     tripped a 240 "too long" limit and dumped instantly, which is most of
     what Arjun writes. Length now decides the PACE, not whether to animate
     at all: the whole message lands inside a fixed budget however long it
     is. */
  var TYPE_BUDGET = 2600;   // ms for the whole reply, however long
  var TYPE_MAX_MS = 34;     // per word, for short replies

  function typeOut(node, text, done){
    var finish = function(){
      node.textContent = text;
      el.log.scrollTop = el.log.scrollHeight;
      if (done) done();
    };
    var reduce = window.matchMedia &&
                 window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return finish();

    var parts = String(text).split(/(\s+)/);
    var words = String(text).trim().split(/\s+/).length;
    if (!words) return finish();

    var per = Math.min(TYPE_MAX_MS, Math.max(6, TYPE_BUDGET / words));
    var i = 0;

    (function step(){
      node.textContent += parts[i];
      var last = parts[i] || '';
      i++;
      el.log.scrollTop = el.log.scrollHeight;
      if (i >= parts.length) { if (done) done(); return; }
      var wait = per;
      if (/[.!?]["')]?$/.test(last)) wait = per * 6;      // breathe at a full stop
      else if (/[,;:]$/.test(last))  wait = per * 3;
      setTimeout(step, wait);
    })();
  }

  function bubble(html, kind){
    var d=document.createElement('div');
    d.className='jv-chat-msg '+kind;
    if(kind==='plan') d.innerHTML=html; else d.textContent=html;
    el.log.appendChild(d); el.log.scrollTop=el.log.scrollHeight; return d;
  }

  function options(list, onPick){
    el.opts.innerHTML='';
    list.forEach(function(o){
      var b=document.createElement('button');
      b.type='button'; b.className='jv-chat-opt'; b.textContent=T(o[0],o[0]);
      b.addEventListener('click', function(){ onPick(o); });
      el.opts.appendChild(b);
    });
  }

  /* ---- itinerary builder -------------------------------------------
     Assembles a trip from cities Jeevo actually visits, joined by roads
     Jeevo has actually driven, using the nights Jeevo actually gives each
     place. Nothing here is invented: if a road is not in the data the
     route does not use it. */

  function esc(x){ return String(x).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  var P = null;              // planner-data.json
  var ADJ = null;            // adjacency built from the edge list

  function adjacency(){
    if (ADJ) return ADJ;
    ADJ = {};
    (P.edges||[]).forEach(function(e){
      (ADJ[e.from] = ADJ[e.from] || []).push({ to:e.to,   km:e.km, hours:e.hours });
      (ADJ[e.to]   = ADJ[e.to]   || []).push({ to:e.from, km:e.km, hours:e.hours });
    });
    return ADJ;
  }

  var trimmedNights = 0;

  function buildItinerary(){
    trimmedNights = 0;
    if (!P) return null;
    var region = answers.region;
    var total  = Number(answers.nights) || 10;

    /* a bigger budget buys a gentler trip: fewer places, longer in each */
    var lux  = /\$5,000|\$8,000|Heritage|luxury/i.test((answers.budget||'') + ' ' + (answers.hotel||''));
    var maxStops = lux ? Math.max(3, Math.round(total/3.5)) : Math.max(3, Math.round(total/2.5));

    var pool = Object.keys(P.cities).filter(function(c){
      return !region || P.cities[c].region === region;
    });
    if (pool.length < 2) pool = Object.keys(P.cities);
    pool.sort(function(a,b){ return P.cities[b].popularity - P.cities[a].popularity; });

    /* Start where people actually land. Picking the most popular city
       instead started a Kerala trip in Periyar, three hours inland, when
       every one of those trips begins at Cochin airport. */
    var GATEWAYS = ['Delhi','Cochin','Chennai','Kolkata','Mumbai','Bangalore','Kathmandu','Hanoi'];
    var adj = adjacency();
    var current = null;
    for (var gi = 0; gi < GATEWAYS.length && !current; gi++) {
      if (pool.indexOf(GATEWAYS[gi]) !== -1) current = GATEWAYS[gi];
    }
    if (!current) current = pool[0];
    if (!current) return null;

    var stops = [{ city:current, nights: P.cities[current].nights + (lux ? 1 : 0) }];
    var used  = {}; used[current] = true;
    var spent = stops[0].nights;

    while (spent < total && stops.length < maxStops) {
      var options = (adj[current] || []).filter(function(n){
        if (used[n.to] || !P.cities[n.to]) return false;
        if (region && P.cities[n.to].region !== region) return false;
        return (n.hours || 99) <= 7;                 // no brutal driving days
      });
      if (!options.length) break;

      /* prefer well-known places, and penalise long drives */
      options.sort(function(a,b){
        var sa = P.cities[a.to].popularity - (a.hours||3) * 0.8;
        var sb = P.cities[b.to].popularity - (b.hours||3) * 0.8;
        return sb - sa;
      });

      var next = options[0];
      var n = P.cities[next.to].nights + (lux ? 1 : 0);
      if (spent + n > total + 1) n = Math.max(1, total - spent);
      if (n <= 0) break;

      stops.push({ city:next.to, nights:n, km:next.km, hours:next.hours });
      used[next.to] = true; spent += n; current = next.to;
    }

    /* Spread any leftover nights round-robin, and cap each place. Without a
       cap the loop kept stacking nights on the most popular city and
       produced five nights in Delhi on a two-week Rajasthan trip, which no
       agent would ever sell. */
    var CAP = lux ? 4 : 3;
    var guard = 0, placed = true;
    while (spent < total && placed && guard++ < 40) {
      placed = false;
      for (var i=0; i<stops.length && spent<total; i++){
        if (stops[i].nights < CAP){ stops[i].nights++; spent++; placed = true; }
      }
    }
    if (spent < total) trimmedNights = total - spent;   // honestly reported below
    return { stops:stops, nights:spent, region:region || 'India', lux:lux, short:trimmedNights };
  }

  function planHtml(trip){
    var html = '<strong>' + esc(trip.region) + ' &middot; ' + trip.nights + ' nights</strong>';
    html += '<span class="jv-plan-route">' +
            trip.stops.map(function(s){ return esc(s.city); }).join(' &rarr; ') + '</span>';
    html += '<div class="jv-plan-days">';
    var day = 1;
    trip.stops.forEach(function(s){
      if (s.km){
        html += '<div class="jv-plan-leg">Day ' + day + ' &middot; drive ' + s.km + 'km' +
                (s.hours ? ', ' + s.hours + (s.hours===1?' hr':' hrs') : '') + '</div>';
      }
      var to = day + s.nights - 1;
      html += '<div class="jv-plan-stop"><b>' + (s.nights>1 ? 'Days '+day+'&ndash;'+to : 'Day '+day) +
              '</b> ' + esc(s.city) + ' &middot; ' + s.nights + (s.nights===1?' night':' nights') + '</div>';
      day = to + 1;
    });
    html += '</div>';
    if (trip.short > 0) html += '<span class="jv-plan-legs">That leaves ' + trip.short +
        ' night' + (trip.short===1?'':'s') + ' spare \u2014 a consultant can add another stop or more time somewhere.</span><br>';
    if (answers.hotel)  html += '<span class="jv-plan-legs">Built around ' + esc(answers.hotel) + '.</span>';
    else if (trip.lux)  html += '<span class="jv-plan-legs">Paced gently, with longer stays.</span>';
    return html;
  }

  function showPlan(){
    var chatting = history.length > 0;
    var seen = chatting ? readConversation() : null;
    var trip = chatting ? null : buildItinerary();
    if (!trip || trip.stops.length < 2){
      bubble(T('chat.m.consultant', "Let me get a consultant to put this one together properly for you."), 'bot');
      return askContact();
    }
    bubble(T('chat.m.plan', "Here's a trip built around that — real routes, real drive times, all places we work in:"), 'bot');
    bubble(planHtml(trip), 'plan');
    bubble(T('chat.m.finetune', "A consultant will fine-tune it around your dates and confirm pricing. Shall I have someone come back to you?"), 'bot');
    askContact();
  }

  function askContact(soft){
    if(!soft) el.row.hidden = true;
    if(soft) bubble(T('chat.m.details', "If you'd like, pop your details in below and a consultant will pick this up \u2014 or keep asking me things."), 'bot');
    el.opts.innerHTML=
      '<form class="jv-chat-lead">'+
        '<input name="name"  type="text"  placeholder="'+T('chat.m.name',"Your name")+'" required>'+
        '<input name="email" type="email" placeholder="'+T('chat.m.email',"Email")+'" required>'+
        '<input name="phone" type="tel"   placeholder="'+T('chat.m.phone',"Phone (optional)")+'">'+
        '<button type="submit" class="jv-chat-opt is-go">'+T('chat.m.send',"Send it over")+'</button>'+
      '</form>';
    el.opts.querySelector('form').addEventListener('submit', sendLead);
  }

  function sendLead(e){
    e.preventDefault();
    var f=e.target, btn=f.querySelector('button');
    btn.disabled=true; btn.textContent='Sending…';
    var chatting = history.length > 0;
    var seen = chatting ? readConversation() : null;
    var trip = chatting ? null : buildItinerary();
    fetch(ENQUIRY,{ method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        name:f.name.value, email:f.email.value, phone:f.phone.value,
        /* answers come from the guided questions, seen from what was said
           in conversation; whichever exists wins, and a field nobody
           mentioned stays empty rather than being guessed at */
        destination:    (trip && trip.region) || (seen && seen.destination) || answers.region || 'Not sure',
        travellers:     answers.party   || (seen && seen.travellers) || '',
        adults:         (seen && seen.adults)   || '',
        children:       (seen && seen.children) || '',
        hotel_standard: answers.hotel   || (seen && seen.hotel)   || '',
        budget:         answers.budget  || (seen && seen.budget)  || '',
        currency:       answers.currency || (seen && seen.currency) || '',
        nights:         answers.nights  || (seen && seen.nights)  || '',
        travel_month:   (seen && seen.month)   || '',
        travel_dates:   (seen && seen.dates)   || '',
        flights:        (seen && seen.flights) || '',
        reason:         (seen && seen.reason)  || '',
        source: chatting ? 'Arjun (chat)' : 'Arjun (trip planner)',
        message: chatting
          ? 'Conversation with Arjun (website assistant):\n\n' + transcript()
          : 'Trip planner draft: '+
            (trip ? trip.stops.map(function(x){ return x.city+' '+x.nights+'n'; }).join(' > ')+
                    ' ('+trip.nights+' nights)' : 'no route built')+
            ' | party: '+(answers.party||'-')+' | hotels: '+(answers.hotel||'-')+
            ' | budget: '+(answers.budget||'-')
      })})
      .then(function(r){ return r.ok; })
      .catch(function(){ return false; })
      .then(function(ok){
        el.opts.innerHTML='';
        bubble(ok ? T('chat.m.sent', "Thanks — that's with our team. Someone will come back to you shortly.")
                  : T('chat.m.sent2', "Thanks — we've got your details. If you don't hear back today, email us directly and we'll jump on it."), 'bot');
        try{ sessionStorage.removeItem(STORE); }catch(err){}
      });
  }

  /* ---- conversational mode ------------------------------------------
     Tries the assistant first. If it is not configured, rate limited or
     down it returns 503 and we drop into the guided questions instead,
     which need no key and always work. The visitor is told once, plainly,
     and never sees a dead end. */
  var botOff = false, history = [], sending = false;

  function dots(on){
    var d = el.log.querySelector('.jv-chat-dots');
    if(!on){ if(d) d.remove(); return; }
    if(d) return;
    d=document.createElement('div'); d.className='jv-chat-dots';
    d.innerHTML='<i></i><i></i><i></i>';
    el.log.appendChild(d); el.log.scrollTop=el.log.scrollHeight;
  }

  function fallToGuided(explain){
    botOff = true;
    el.row.hidden = true;
    if(explain) bubble(T('chat.m.guided', "Let me ask you a few quick questions instead — it only takes a minute."), 'bot');
    /* the opening question is already on screen from start(); re-asking
       it here printed it twice */
    if(step === 0 && el.opts.children.length) return;
    setTimeout(ask, 320);
  }

  /* The free tier allows a limited number of requests a minute, so two
     people testing at once is enough to get a 429. Treating that as "the
     assistant is down" threw the whole conversation into the scripted
     questions, which then ignored everything already said. A blip is now
     just a blip: wait, try again, and only give up if it fails twice. */
  function sendText(retryOf){
    var text = retryOf || (el.input.value||'').trim();
    if(!text || sending || botOff) return;
    if(!retryOf){
      el.input.value=''; el.input.style.height='auto';
      bubble(text,'me'); history.push({role:'user',content:text}); save();
    }
    sending=true; el.send.disabled=true; dots(true);

    fetch('/api/chat',{ method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages: history, lang: (window.jvLang ? window.jvLang() : 'en') }) })
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, j:j}; }); })
      .then(function(res){
        if(res.ok && res.j.reply){
          sending=false; el.send.disabled=false; dots(false);
          var node = bubble('', 'bot');
          history.push({role:'assistant',content:res.j.reply});
          save();
          typeOut(node, res.j.reply, function(){ maybeOfferContact(res.j.ready); });
          return;
        }
        throw new Error((res.j && res.j.reason) || 'failed');
      })
      .catch(function(){
        if(!retryOf){
          /* one quiet retry, long enough for a per-minute limit to clear */
          setTimeout(function(){ sending=false; sendText(text); }, 3200);
          return;
        }
        sending=false; el.send.disabled=false; dots(false);
        bubble(T('chat.m.down', "Sorry — I could not reach our planner just then. Try me again in a moment, or answer a few quick questions instead."), 'bot');
        fallToGuided(false);
      });
  }


  /* A chat that goes nowhere is a lost lead. Once the conversation has
     real substance, offer the hand-off below the chat - without taking
     the typing box away, so they can keep talking if they want to. */
  var offered = false;
  /* Ask for contact details once Arjun actually has a trip to hand over,
     not after an arbitrary number of messages. Asking at message three,
     before anyone has said where or when, reads as a form ambushing a
     conversation - and the record it produces is a name and nothing else,
     which is no use to whoever picks it up.

     "Enough" is somewhere to go plus two more details. The turn cap is a
     backstop: if someone has talked for a while without pinning anything
     down, take their details anyway rather than never asking. */
  /* A destination plus any two details was too low a bar: Arjun would
     describe a route in detail and the form would slide in before he had
     asked who was going, when, or what they wanted to spend. The lead that
     produces is half a brief.

     He now needs a place, a WHEN, and a WHO before the form appears, and
     ideally something about money or standard too. The turn cap is the
     backstop for someone who talks a lot without committing to anything. */
  var WHEN  = ['nights','month','dates'];
  var WHO   = ['travellers','adults','children'];
  var MONEY = ['budget','hotel','flights'];
  var MAX_TURNS_BEFORE_ASKING = 9;

  function has(seen, keys){
    for (var i = 0; i < keys.length; i++) if (seen[keys[i]]) return true;
    return false;
  }

  function enoughGathered(){
    var seen = readConversation();
    if (!seen.destination) return false;
    if (!has(seen, WHEN)) return false;
    if (!has(seen, WHO))  return false;
    return true;
  }

  /* a fuller brief: everything above plus budget or standard */
  function fullyGathered(){
    var seen = readConversation();
    return enoughGathered() && has(seen, MONEY);
  }

  /* Arjun says when he is done, by ending a message with a marker the
     server strips into a flag. He is in the conversation and judges it far
     better than reading the transcript from outside ever did - that gate
     swung from interrupting him mid-explanation to never opening at all.

     The reading of the transcript stays as a safety net for the case where
     he forgets to signal. */
  /* If Arjun finishes without the budget - he asks once and gives up when
     the visitor talks past him - the widget asks for it itself, with
     buttons. Blocking the form instead just stalled the conversation: he
     had said the form was coming and nothing appeared. */
  function askBudgetThenContact(){
    bubble(T('chat.m.budget', "Before I pass this to a consultant \u2014 roughly what were you thinking per person? It only changes which hotels we suggest."), 'bot');
    options([
      ['Under $2,000','Under $2,000'], ['$2,000 \u2013 $3,500','$2,000 - $3,500'],
      ['$3,500 \u2013 $5,000','$3,500 - $5,000'], ['$5,000 \u2013 $8,000','$5,000 - $8,000'],
      ['$8,000+','$8,000+'], ['Rather not say','']
    ], function(o){
      bubble(o[0], 'me');
      answers.budget = o[1];
      save();
      setTimeout(function(){ askContact(true); }, 260);
    });
  }

  function maybeOfferContact(arjunSaysReady){
    if(offered || botOff) return;
    var turns = history.filter(function(m){ return m.role==='user'; }).length;
    var seen  = readConversation();
    var haveBudget = !!(seen.budget || answers.budget);

    var ready = arjunSaysReady
             || (turns >= 4 && enoughGathered())
             || turns >= MAX_TURNS_BEFORE_ASKING;
    if(!ready) return;

    offered = true;
    /* budget is the field a consultant most needs and the one he skips */
    if(!haveBudget){ el.row.hidden = true; askBudgetThenContact(); return; }
    askContact(true);
  }



  /* Pull whatever the conversation revealed, so the agent is not reading
     a transcript cold. Place names come from the planner data. */
  /* Read the enquiry back out of what the visitor actually said, so the
     agent opens a filled-in record instead of a transcript. People write
     "two of us" and "a couple of grand each", not "adults: 2". Only what
     is clearly stated is recorded - a blank field is correct when the
     subject never came up, and far better than a guess. */
  var WORDNUM = { a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6,
                  seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12,
                  couple:2, pair:2 };
  function num(word){
    if(!word) return null;
    var w = String(word).toLowerCase().replace(/,/g,'');
    if(/^\d+$/.test(w)) return parseInt(w,10);
    return WORDNUM[w] || null;
  }

  function readConversation(){
    /* only what the VISITOR said - Arjun's own suggestions are not facts
       about the trip they want */
    var said = history.filter(function(m){ return m.role === 'user'; })
                      .map(function(m){ return m.content; }).join('. ');
    var low = said.toLowerCase();
    var out = { destination:'', nights:'', month:'', dates:'', budget:'',
                currency:'', hotel:'', adults:'', children:'', travellers:'',
                flights:'', reason:'' };

    /* --- where --- */
    if(P && P.cities){
      var hits = Object.keys(P.cities).filter(function(c){
        return c.length > 3 && low.indexOf(c.toLowerCase()) !== -1;
      });
      if(hits.length) out.destination = hits.slice(0,6).join(', ');
    }
    var REG = ['Golden Triangle','South India','North India','East India',
               'Rajasthan','Keralam','Goa','Ladakh','the North East','Nepal','Vietnam'];
    for(var i=0;i<REG.length;i++){
      if(low.indexOf(REG[i].toLowerCase())!==-1){
        out.destination = out.destination ? REG[i]+' — '+out.destination : REG[i];
        break;
      }
    }

    /* --- how long --- */
    var n = low.match(/(\d{1,2}|[a-z]+)[\s-]*(?:nights?|days?)\b/);
    if(n && num(n[1])) out.nights = String(num(n[1]));
    else {
      var w = low.match(/\b(a|one|two|three|four)\s+weeks?\b/);
      if(w && num(w[1])) out.nights = String(num(w[1]) * 7);
    }

    /* --- when --- */
    var MON = 'january|february|march|april|may|june|july|august|september|october|november|december';
    var m = low.match(new RegExp('\\b(' + MON + ')\\b'));
    if(m) out.month = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    var d = said.match(new RegExp('\\b(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:' + MON + ')(?:\\s+\\d{4})?)\\b','i'))
         || said.match(/\b(\d{4}-\d{2}-\d{2})\b/)
         || said.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
    if(d) out.dates = d[1];

    /* --- who --- */
    var ad = low.match(/(\d{1,2}|[a-z]+)\s+adults?\b/);
    if(ad && num(ad[1])) out.adults = String(num(ad[1]));
    var ch = low.match(/(\d{1,2}|[a-z]+)\s+(?:children|kids?|child)\b/);
    if(ch && num(ch[1])) out.children = String(num(ch[1]));

    /* People name children by age or relationship far more often than they
       count them: "our 8 year old", "with our daughter". Counting only
       "two children" missed a child entirely and left the party one short. */
    if(!out.children){
      var ages = low.match(/\b(\d{1,2})[\s-]?(?:year[\s-]?old|yo|yr[\s-]?old)\b/g) || [];
      var kids = ages.filter(function(a){ var n = parseInt(a,10); return n >= 0 && n < 18; }).length;
      if(!kids){
        var rel = low.match(/\b(?:our|my|their|with (?:our|my))\s+(?:daughter|son|little one|youngest|eldest|kids?|children)\b/g) || [];
        kids = rel.length ? Math.max(1, rel.length) : 0;
      }
      if(kids) out.children = String(kids);
    }
    var pax = low.match(/(?:just\s+)?(?:the\s+)?(\d{1,2}|[a-z]+)\s+of\s+us\b/)
           || low.match(/(?:party|group|family)\s+of\s+(\d{1,2}|[a-z]+)\b/)
           || low.match(/(\d{1,2}|[a-z]+)\s+(?:people|pax|travellers|travelers)\b/);
    if(pax && num(pax[1])) out.travellers = String(num(pax[1]));
    /* Adults plus children is a fact; "anniversary" is a guess. Counting
       the guess first produced two travellers for a couple who had just
       said they were bringing their eight-year-old. */
    if(out.adults){
      out.travellers = String(num(out.adults) + (num(out.children) || 0));
    }
    if(!out.travellers && /\b(my (wife|husband|partner) and i|me and my (wife|husband|partner)|honeymoon|anniversary)\b/.test(low))
      out.travellers = '2';
    if(!out.travellers && /\b(solo|on my own|by myself|just me)\b/.test(low)) out.travellers = '1';

    /* --- money. "5k each", "around 4000", "$3,500", "2 lakh"
       A bare "$" is ambiguous and worth 35% either way between AUD and USD,
       so it is recorded as unknown rather than assumed. */
    var b = said.match(/(?:A\$|AU\$|US\$|NZ\$|C\$|S\$|[$£€₹])\s?([\d,]+(?:\.\d+)?)/i)
         || low.match(/\b([\d,]{3,9})\s*(?:dollars|aud|usd|gbp|eur|pounds|euros|rupees|inr|bucks)\b/)
         || low.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:k|lakhs?|lacs?)\b/)
         /* "around 6000 each", "budget 6000", "6000 per person" - people
            drop the currency far more often than they include it, and the
            whole figure was being lost when they did */
         || low.match(/(?:budget|spend|spending|around|about|roughly|maybe|up to|under)\D{0,12}\b([\d,]{3,9})\b/)
         || low.match(/\b([\d,]{3,9})\s*(?:each|per person|per head|pp|a head)\b/);
    if(b){
      var token = b[0];
      var raw   = Number(b[1].replace(/,/g,''));
      if(/\blakh|lac\b/i.test(token)) raw *= 100000;
      else if(/\dk\b|\d\s?k\b/i.test(token)) raw *= 1000;
      if(raw >= 500 && raw <= 100000000){
        out.budget = Math.round(raw).toLocaleString('en-US');

        if(/A\$|AU\$|\baud\b/i.test(token))            out.currency = 'AUD';
        else if(/US\$|\busd\b/i.test(token))           out.currency = 'USD';
        else if(/NZ\$/i.test(token))                   out.currency = 'NZD';
        else if(/C\$/i.test(token))                    out.currency = 'CAD';
        else if(/£|\bgbp\b|pounds?/i.test(token))      out.currency = 'GBP';
        else if(/€|\beur\b|euros?/i.test(token))       out.currency = 'EUR';
        else if(/₹|\binr\b|rupees?|lakh|lac/i.test(token)) out.currency = 'INR';
      }
      /* a plain "$" or a bare number: see if they said where they are */
      if(!out.currency){
        if(/\baud\b|australia|sydney|melbourne|brisbane|perth|adelaide/i.test(low)) out.currency = 'AUD';
        else if(/\bnz\b|new zealand|auckland/i.test(low))        out.currency = 'NZD';
        else if(/\buk\b|britain|england|london|scotland/i.test(low)) out.currency = 'GBP';
        else if(/\busa?\b|america|united states/i.test(low))     out.currency = 'USD';
        else if(/india|delhi|mumbai|bangalore/i.test(low) && /₹|rupee/i.test(low)) out.currency = 'INR';
        else out.currency = 'Not stated';
      }
    }

    /* --- hotels --- */
    if(/heritage|palace/.test(low))                 out.hotel = 'Heritage / palace stays';
    else if(/5[\s-]?star|luxur|five[\s-]star/.test(low)) out.hotel = '5-star – luxury';
    else if(/4[\s-]?star|four[\s-]star|premium/.test(low)) out.hotel = '4-star – premium';
    /* "budget" is not in this list: in "budget 2 lakh each" it means money,
       and reading it as budget accommodation invented a hotel standard
       nobody had asked for. */
    else if(/3[\s-]?star|three[\s-]star|cheap|modest|simple|comfortable/.test(low)) out.hotel = '3-star \u2013 comfortable';

    /* --- flights --- */
    /* "my flights are booked" and "we've sorted flights" are how people
       actually say it; only matching "land only" missed them. */
    if(/land only|our own flights|book(?:ing)? (?:our|the) (?:own )?flights|without flights|no flights|flights (?:are|r) (?:already )?(?:booked|sorted|done)|(?:already|we have|we've|i have|i've) (?:got |booked )?(?:our |my )?flights|sorted (?:our |my )?flights/.test(low))
      out.flights = "Land only – we'll book our own flights";
    else if(/include flights|with flights|need flights|book(?:ing)? flights for us|flights included/.test(low))
      out.flights = 'Please include flights';

    /* --- what kind of enquiry --- */
    if(/yatra|pilgrimage|jyotirlinga|char dham|temple tour/.test(low)) out.reason = 'Pilgrimage / yatra enquiry';
    else if(/group|family|friends|colleagues|\bwe are \d+/.test(low))  out.reason = 'Group or family booking';
    else if(/custom|tailor|bespoke|our own itinerary|build us/.test(low)) out.reason = 'Planning a custom trip';
    else if(out.destination)                                           out.reason = 'Enquiring about a tour';

    return out;
  }
  function transcript(){
    return history.map(function(m){
      return (m.role==='user' ? 'Visitor: ' : 'Arjun: ') + m.content;
    }).join('\n').slice(-1800);
  }

  function ask(){
    if(step>=STEPS.length) return showPlan();
    var s=STEPS[step];
    bubble(T(s.q,''),'bot');
    options(s.opts, function(o){
      el.row.hidden = true;
      bubble(T(o[0],''),'me');
      answers[s.key]=o[1];
      step++; save();
      setTimeout(ask, 260);
    });
  }

  /* Decide the mode before showing anything. With the assistant connected
     this is a plain chat and no buttons appear at all; without it, the
     guided questions. Typing "hi" and being handed a form is worse than
     either. */
  function resume(){
    if(!history.length) return false;
    el.log.innerHTML='';
    bubble(T('chat.m.resume', "Picking up where we left off\u2026"), 'bot');
    history.forEach(function(m){ bubble(m.content, m.role==='user' ? 'me' : 'bot'); });
    botOff = (resumedMode === 'guided');
    el.row.hidden = botOff;
    if(botOff){ setTimeout(ask, 320); } else { setTimeout(function(){ el.input.focus(); }, 80); }
    return true;
  }

  function start(){
    if(resume()) return;
    el.log.innerHTML=''; el.opts.innerHTML=''; answers={}; step=0; history=[]; botOff=false;
    el.row.hidden = true;

    fetch('/api/chat').then(function(r){ return r.json(); }).catch(function(){ return {ready:false}; })
      .then(function(st){
        if(st && st.ready){
          botOff = false;
          el.row.hidden = false;
          bubble(T('chat.m.hi', "Hi, I'm Arjun \u2014 I help plan trips here at Jeevo. Ask me anything, or just tell me what you're thinking."), 'bot');
          setTimeout(function(){ el.input.focus(); }, 80);
        } else {
          botOff = true;
          bubble(T('chat.m.hi2', "Hi, I'm Arjun. Answer a few quick questions and I'll build you an itinerary."), 'bot');
          setTimeout(ask, 320);
        }
      });
  }

  function open(){
    if(el.teaser && el.teaser.parentNode){ el.teaser.remove(); }
    markTeased();
    el.fab.classList.remove('is-new');
    el.panel.classList.add('is-open'); el.fab.hidden=true;
    if(!el.log.children.length) start();
  }
  function close(){ el.panel.classList.remove('is-open'); el.fab.hidden=false; el.fab.focus(); }

  /* One nudge, six seconds in, dismissible, and never shown twice in a
     session. Anything more insistent than that reads as a pop-up and
     people close the tab rather than the bubble. */
  var TEASED = 'jeevo_teased_v1';
  function teased(){ try{ return sessionStorage.getItem(TEASED)==='1'; }catch(e){ return false; } }
  function markTeased(){ try{ sessionStorage.setItem(TEASED,'1'); }catch(e){} }

  function teaser(){
    if(teased() || el.panel.classList.contains('is-open')) return;
    var t=document.createElement('div');
    t.className='jv-chat-teaser';
    t.innerHTML='<button class="jv-chat-teaser-x" type="button" aria-label="No thanks">&times;</button>'+
                '<span data-i18n="chat.teaser">Planning a trip to India? I\'ll build you an itinerary in about a minute \u2014 free, no obligation.</span>';
    t.addEventListener('click', function(e){
      if(e.target.classList.contains('jv-chat-teaser-x')){ markTeased(); t.remove(); return; }
      markTeased(); t.remove(); open();
    });
    document.body.appendChild(t);
    el.teaser = t;
    setTimeout(function(){ if(t.parentNode && !teased()){ markTeased(); t.remove(); } }, 16000);
  }

  function init(){
    load(); build();
    /* anything on the page can open the chat: data-jv-chat on a button or link */
    document.querySelectorAll('[data-jv-chat]').forEach(function(n){
      n.addEventListener('click', function(e){ e.preventDefault(); open(); });
    });
    if(!teased()){
      el.fab.classList.add('is-new');
      setTimeout(teaser, 6000);
    }
    el.fab.addEventListener('click', open);
    el.close.addEventListener('click', close);
    el.send.addEventListener('click', sendText);
    el.input.addEventListener('keydown', function(e){
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendText(); }
    });
    el.input.addEventListener('input', function(){
      el.input.style.height='auto';
      el.input.style.height=Math.min(el.input.scrollHeight,110)+'px';
    });
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape' && el.panel.classList.contains('is-open')) close();
    });
    var base=location.pathname.indexOf('/tours/')===0 ? '../' : '';
    fetch(base+DATA_URL).then(function(r){ return r.json(); })
      .then(function(j){ P=j; })
      .catch(function(){ P=null; });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
