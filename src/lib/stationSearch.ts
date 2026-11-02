import {
  NormalizedStation,
  RawStationRecord,
  StationAuditReport,
  StationCategory,
} from '../types/railway';

export const RAILWAY_ZONE_NAMES: Record<string, string> = {
  NR: 'Northern Railway',
  SCR: 'South Central Railway',
  ECR: 'East Central Railway',
  SR: 'Southern Railway',
  WR: 'Western Railway',
  NWR: 'North Western Railway',
  ER: 'Eastern Railway',
  NFR: 'Northeast Frontier Railway',
  NER: 'North Eastern Railway',
  CR: 'Central Railway',
  NCR: 'North Central Railway',
  SWR: 'South Western Railway',
  SER: 'South Eastern Railway',
  ECOR: 'East Coast Railway',
  SECR: 'South East Central Railway',
  WCR: 'West Central Railway',
  KR: 'Konkan Railway',
  BR: 'Bangladesh Railway (Cross-Border)',
};

interface StationEnrichment {
  city: string;
  state: string;
  hindiName: string;
  aliases: string[];
  isMajorInterchange?: boolean;
}

/**
 * Curated city, alias, historical name, and Hindi/Devanagari enrichment for major stations
 * and all stations along the Rourkela–Varanasi & national trunk corridors.
 */
export const STATION_ENRICHMENTS: Record<string, StationEnrichment> = {
  ROU: {
    city: 'Rourkela',
    state: 'Odisha',
    hindiName: 'राउरकेला जंक्शन',
    aliases: ['rourkela junction', 'rourkela jn', 'steel city odisha', 'राउरकेला'],
    isMajorInterchange: true,
  },
  ROP: {
    city: 'Rupsa / Balasore',
    state: 'Odisha',
    hindiName: 'रुपसा जंक्शन',
    aliases: ['rupsa junction', 'rupsa jn', 'rupsa', 'रुपसा'],
    isMajorInterchange: true,
  },
  BPO: {
    city: 'Baripada',
    state: 'Odisha',
    hindiName: 'बारीपदा',
    aliases: ['baripada', 'mayurbhanj', 'बारीपदा'],
    isMajorInterchange: false,
  },
  SRR: {
    city: 'Shoranur',
    state: 'Kerala',
    hindiName: 'शोरानूर जंक्शन',
    aliases: ['shoranur junction', 'shoranur jn', 'shoranur', 'शोरानूर'],
    isMajorInterchange: true,
  },
  TCR: {
    city: 'Thrissur',
    state: 'Kerala',
    hindiName: 'त्रिशूर',
    aliases: ['thrissur', 'trichur', 'त्रिशूर'],
    isMajorInterchange: true,
  },
  OTP: {
    city: 'Ottappalam',
    state: 'Kerala',
    hindiName: 'ओट्टापालम',
    aliases: ['ottappalam', 'ottapalam', 'ओट्टापालम'],
    isMajorInterchange: false,
  },
  UD: {
    city: 'Udupi',
    state: 'Karnataka',
    hindiName: 'उडुपी',
    aliases: ['udupi', 'udipi', 'उडुपी'],
    isMajorInterchange: false,
  },
  PGT: {
    city: 'Palakkad',
    state: 'Kerala',
    hindiName: 'पलक्कड़ जंक्शन',
    aliases: ['palakkad junction', 'palakkad jn', 'palghat junction', 'पलक्कड़'],
    isMajorInterchange: true,
  },
  ERS: {
    city: 'Kochi / Ernakulam',
    state: 'Kerala',
    hindiName: 'एर्णाकुलम जंक्शन',
    aliases: ['ernakulam junction', 'ernakulam south', 'kochi', 'एर्णाकुलम'],
    isMajorInterchange: true,
  },
  KGP: {
    city: 'Kharagpur',
    state: 'West Bengal',
    hindiName: 'खड़गपुर जंक्शन',
    aliases: ['kharagpur', 'kharagpur junction', 'kharagpur jn', 'खड़गपुर'],
    isMajorInterchange: true,
  },
  BSB: {
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    hindiName: 'वाराणसी जंक्शन',
    aliases: ['varanasi junction', 'banaras', 'benares', 'kashi', 'वाराणसी', 'बनारस', 'काशी'],
    isMajorInterchange: true,
  },
  BSBS: {
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    hindiName: 'बनारस (मंडुआडीह)',
    aliases: ['banaras', 'manduadih', 'muv', 'varanasi manduadih', 'बनारस', 'मंडुआडीह'],
    isMajorInterchange: true,
  },
  DDU: {
    city: 'Chandauli / Varanasi',
    state: 'Uttar Pradesh',
    hindiName: 'पं. दीन दयाल उपाध्याय जंक्शन',
    aliases: ['mughalsarai', 'mgs', 'deen dayal upadhyaya', 'pt deen dayal upadhyay jn', 'varanasi gateway', 'मुगलसराय', 'दीन दयाल उपाध्याय'],
    isMajorInterchange: true,
  },
  RNC: {
    city: 'Ranchi',
    state: 'Jharkhand',
    hindiName: 'रांची जंक्शन',
    aliases: ['ranchi junction', 'ranchi jn', 'रांची'],
    isMajorInterchange: true,
  },
  HTE: {
    city: 'Ranchi',
    state: 'Jharkhand',
    hindiName: 'हटिया',
    aliases: ['hatia', 'ranchi hatia', 'हटिया'],
    isMajorInterchange: true,
  },
  TATA: {
    city: 'Jamshedpur',
    state: 'Jharkhand',
    hindiName: 'टाटानगर जंक्शन',
    aliases: ['tatanagar', 'jamshedpur', 'tata nagar', 'टाटानगर', 'जमशेदपुर'],
    isMajorInterchange: true,
  },
  DHN: {
    city: 'Dhanbad',
    state: 'Jharkhand',
    hindiName: 'धनबाद जंक्शन',
    aliases: ['dhanbad junction', 'coal capital', 'धनबाद'],
    isMajorInterchange: true,
  },
  GAYA: {
    city: 'Gaya',
    state: 'Bihar',
    hindiName: 'गया जंक्शन',
    aliases: ['gaya junction', 'bodhgaya', 'bodh gaya', 'गया'],
    isMajorInterchange: true,
  },
  BKSC: {
    city: 'Bokaro',
    state: 'Jharkhand',
    hindiName: 'बोकारो स्टील सिटी',
    aliases: ['bokaro steel city', 'bokaro', 'बोकारो'],
    isMajorInterchange: true,
  },
  GMO: {
    city: 'Gomoh',
    state: 'Jharkhand',
    hindiName: 'नेताजी सुभाष चंद्र बोस गोमो',
    aliases: ['gomoh', 'nsc bose j gomo', 'netaji subhas chandra bose gomoh', 'गोमो'],
    isMajorInterchange: true,
  },
  MURI: {
    city: 'Muri',
    state: 'Jharkhand',
    hindiName: 'मुरी जंक्शन',
    aliases: ['muri junction', 'muri jn', 'मुरी'],
    isMajorInterchange: true,
  },
  BRKA: {
    city: 'Ramgarh / Barkakana',
    state: 'Jharkhand',
    hindiName: 'बरकाकाना जंक्शन',
    aliases: ['barkakana', 'barka kana', 'ramgarh', 'बरकाकाना'],
    isMajorInterchange: true,
  },
  JSG: {
    city: 'Jharsuguda',
    state: 'Odisha',
    hindiName: 'झारसुगुड़ा जंक्शन',
    aliases: ['jharsuguda junction', 'jharsuguda', 'झारसुगुड़ा'],
    isMajorInterchange: true,
  },
  BSP: {
    city: 'Bilaspur',
    state: 'Chhattisgarh',
    hindiName: 'बिलासपुर जंक्शन',
    aliases: ['bilaspur junction', 'bilaspur', 'बिलासपुर'],
    isMajorInterchange: true,
  },
  PCOI: {
    city: 'Prayagraj',
    state: 'Uttar Pradesh',
    hindiName: 'प्रयागराज छिवकी',
    aliases: ['allahabad chheoki', 'chheoki', 'prayagraj chheoki', 'इलाहाबाद छिवकी', 'प्रयागराज छिवकी'],
    isMajorInterchange: true,
  },
  PRYJ: {
    city: 'Prayagraj',
    state: 'Uttar Pradesh',
    hindiName: 'प्रयागराज जंक्शन',
    aliases: ['allahabad', 'ald', 'allahabad jn', 'prayagraj junction', 'इलाहाबाद', 'प्रयागराज'],
    isMajorInterchange: true,
  },
  CKP: {
    city: 'Chakradharpur',
    state: 'Jharkhand',
    hindiName: 'चक्रधरपुर',
    aliases: ['chakradharpur', 'चक्रधरपुर'],
    isMajorInterchange: true,
  },
  CNI: {
    city: 'Chandil',
    state: 'Jharkhand',
    hindiName: 'चांडिल जंक्शन',
    aliases: ['chandil', 'chandil junction', 'चांडिल'],
    isMajorInterchange: true,
  },
  PRR: {
    city: 'Purulia',
    state: 'West Bengal',
    hindiName: 'पुरुलिया जंक्शन',
    aliases: ['purulia', 'purulia jn', 'पुरुलिया'],
    isMajorInterchange: true,
  },
  ASN: {
    city: 'Asansol',
    state: 'West Bengal',
    hindiName: 'आसनसोल जंक्शन',
    aliases: ['asansol', 'asansol junction', 'आसनसोल'],
    isMajorInterchange: true,
  },
  HWH: {
    city: 'Kolkata / Howrah',
    state: 'West Bengal',
    hindiName: 'हावड़ा जंक्शन',
    aliases: ['howrah', 'kolkata', 'calcutta', 'हावड़ा', 'कोलकाता'],
    isMajorInterchange: true,
  },
  SDAH: {
    city: 'Kolkata',
    state: 'West Bengal',
    hindiName: 'सियालदह',
    aliases: ['sealdah', 'kolkata sealdah', 'सियालदह'],
    isMajorInterchange: true,
  },
  PNBE: {
    city: 'Patna',
    state: 'Bihar',
    hindiName: 'पटना जंक्शन',
    aliases: ['patna', 'patna junction', 'पटना'],
    isMajorInterchange: true,
  },
  NDLS: {
    city: 'New Delhi',
    state: 'Delhi',
    hindiName: 'नई दिल्ली',
    aliases: ['new delhi', 'delhi', 'नई दिल्ली', 'दिल्ली'],
    isMajorInterchange: true,
  },
  DLI: {
    city: 'Delhi',
    state: 'Delhi',
    hindiName: 'पुरानी दिल्ली जंक्शन',
    aliases: ['old delhi', 'delhi jn', 'पुरानी दिल्ली'],
    isMajorInterchange: true,
  },
  NZM: {
    city: 'New Delhi',
    state: 'Delhi',
    hindiName: 'हज़रत निज़ामुद्दीन',
    aliases: ['hazrat nizamuddin', 'nizamuddin', 'delhi nzm', 'निज़ामुद्दीन'],
    isMajorInterchange: true,
  },
  ANVT: {
    city: 'New Delhi',
    state: 'Delhi',
    hindiName: 'आनंद विहार टर्मिनल',
    aliases: ['anand vihar terminal', 'anand vihar', 'आनंद विहार'],
    isMajorInterchange: true,
  },
  CSMT: {
    city: 'Mumbai',
    state: 'Maharashtra',
    hindiName: 'छत्रपति शिवाजी महाराज टर्मिनस मुंबई',
    aliases: ['mumbai csmt', 'cst', 'vt', 'victoria terminus', 'bombay', 'मुंबई'],
    isMajorInterchange: true,
  },
  LTT: {
    city: 'Mumbai',
    state: 'Maharashtra',
    hindiName: 'लोकमान्य तिलक टर्मिनस',
    aliases: ['lokmanya tilak terminus', 'kurla terminus', 'mumbai ltt'],
    isMajorInterchange: true,
  },
  MMCT: {
    city: 'Mumbai',
    state: 'Maharashtra',
    hindiName: 'मुंबई सेंट्रल',
    aliases: ['mumbai central', 'bct', 'bombay central'],
    isMajorInterchange: true,
  },
  MAS: {
    city: 'Chennai',
    state: 'Tamil Nadu',
    hindiName: 'एमजीआर चेन्नई सेंट्रल',
    aliases: ['chennai central', 'madras', 'mgr chennai central', 'चेन्नई'],
    isMajorInterchange: true,
  },
  SBC: {
    city: 'Bengaluru',
    state: 'Karnataka',
    hindiName: 'केएसआर बेंगलुरु सिटी',
    aliases: ['bangalore', 'bengaluru', 'ksr bengaluru', 'majestic', 'बेंगलुरु'],
    isMajorInterchange: true,
  },
  BBS: {
    city: 'Bhubaneswar',
    state: 'Odisha',
    hindiName: 'भुवनेश्वर',
    aliases: ['bhubaneswar', 'bhubaneshwar', 'भुवनेश्वर'],
    isMajorInterchange: true,
  },
  PURI: {
    city: 'Puri',
    state: 'Odisha',
    hindiName: 'पुरी',
    aliases: ['jagannath puri', 'puri', 'पुरी'],
    isMajorInterchange: true,
  },
  VSKP: {
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    hindiName: 'विशाखापत्तनम',
    aliases: ['visakhapatnam', 'vizag', 'waltair', 'विशाखापत्तनम'],
    isMajorInterchange: true,
  },
  SBP: {
    city: 'Sambalpur',
    state: 'Odisha',
    hindiName: 'संबलपुर',
    aliases: ['sambalpur', 'संबलपुर'],
    isMajorInterchange: true,
  },
  NGP: {
    city: 'Nagpur',
    state: 'Maharashtra',
    hindiName: 'नागपुर जंक्शन',
    aliases: ['nagpur', 'nagpur junction', 'नागपुर'],
    isMajorInterchange: true,
  },
  R: {
    city: 'Raipur',
    state: 'Chhattisgarh',
    hindiName: 'रायपुर जंक्शन',
    aliases: ['raipur', 'raipur jn', 'रायपुर'],
    isMajorInterchange: true,
  },
  KTE: {
    city: 'Katni',
    state: 'Madhya Pradesh',
    hindiName: 'कटनी जंक्शन',
    aliases: ['katni', 'katni junction', 'कटनी'],
    isMajorInterchange: true,
  },
  STA: {
    city: 'Satna',
    state: 'Madhya Pradesh',
    hindiName: 'सतना जंक्शन',
    aliases: ['satna', 'सतना'],
    isMajorInterchange: true,
  },
  DOS: {
    city: 'Dehri',
    state: 'Bihar',
    hindiName: 'डेहरी ऑन सोन',
    aliases: ['dehri on sone', 'dehri', 'डेहरी'],
    isMajorInterchange: true,
  },
  SSM: {
    city: 'Sasaram',
    state: 'Bihar',
    hindiName: 'सासाराम जंक्शन',
    aliases: ['sasaram', 'सासाराम'],
    isMajorInterchange: true,
  },
  GHD: {
    city: 'Garhwa',
    state: 'Jharkhand',
    hindiName: 'गढ़वा रोड जंक्शन',
    aliases: ['garwa road', 'garhwa road', 'गढ़वा रोड'],
    isMajorInterchange: true,
  },
  DTO: {
    city: 'Medininagar / Daltonganj',
    state: 'Jharkhand',
    hindiName: 'डालटनगंज',
    aliases: ['daltonganj', 'medininagar', 'डालटनगंज'],
    isMajorInterchange: false,
  },
  LKO: {
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    hindiName: 'लखनऊ चारबाग',
    aliases: ['lucknow', 'charbagh', 'लखनऊ'],
    isMajorInterchange: true,
  },
  CNB: {
    city: 'Kanpur',
    state: 'Uttar Pradesh',
    hindiName: 'कानपुर सेंट्रल',
    aliases: ['kanpur', 'kanpur central', 'cawnpore', 'कानपुर'],
    isMajorInterchange: true,
  },
  BPL: {
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    hindiName: 'भोपाल जंक्शन',
    aliases: ['bhopal', 'भोपाल'],
    isMajorInterchange: true,
  },
  ET: {
    city: 'Itarsi',
    state: 'Madhya Pradesh',
    hindiName: 'इटारसी जंक्शन',
    aliases: ['itarsi', 'itarsi jn', 'इटारसी'],
    isMajorInterchange: true,
  },
  PUNE: {
    city: 'Pune',
    state: 'Maharashtra',
    hindiName: 'पुणे जंक्शन',
    aliases: ['pune', 'poona', 'पुणे'],
    isMajorInterchange: true,
  },
  ADI: {
    city: 'Ahmedabad',
    state: 'Gujarat',
    hindiName: 'अहमदाबाद जंक्शन',
    aliases: ['ahmedabad', 'kalupur', 'अहमदाबाद'],
    isMajorInterchange: true,
  },
  JP: {
    city: 'Jaipur',
    state: 'Rajasthan',
    hindiName: 'जयपुर जंक्शन',
    aliases: ['jaipur', 'pink city', 'जयपुर'],
    isMajorInterchange: true,
  },
  SC: {
    city: 'Hyderabad / Secunderabad',
    state: 'Telangana',
    hindiName: 'सिकंदराबाद जंक्शन',
    aliases: ['secunderabad', 'hyderabad', 'सिकंदराबाद', 'हैदराबाद'],
    isMajorInterchange: true,
  },
  BZA: {
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    hindiName: 'विजयवाड़ा जंक्शन',
    aliases: ['vijayawada', 'bezawada', 'विजयवाड़ा'],
    isMajorInterchange: true,
  },
};

export function classifyStationCategory(rawName: string, code: string): StationCategory {
  const upper = rawName.toUpperCase().trim();
  if (
    upper.endsWith(' JN') ||
    upper.endsWith(' JN.') ||
    upper.includes(' JN ') ||
    upper.includes('JUNCTION') ||
    ['ROU', 'RNC', 'TATA', 'DHN', 'GAYA', 'DDU', 'BSB', 'MURI', 'BRKA'].includes(code)
  ) {
    return 'JUNCTION';
  }
  if (upper.includes('TRM') || upper.includes('TERM') || upper.includes('TERMINUS')) {
    return 'TERMINUS';
  }
  if (upper.includes('CENTRAL') || upper.includes('CNTL') || upper.includes('CTRL')) {
    return 'CENTRAL';
  }
  if (upper.includes('CANTT') || upper.includes('CANT')) {
    return 'CANTT';
  }
  if (
    upper.endsWith(' H') ||
    upper.endsWith(' HALT') ||
    upper.endsWith(' PH') ||
    upper.endsWith(' P H') ||
    upper.endsWith(' F')
  ) {
    return 'HALT';
  }
  return 'REGULAR';
}

export function formatStationDisplayName(rawName: string, code: string): string {
  const enrichment = STATION_ENRICHMENTS[code];
  const cleaned = rawName
    .trim()
    .replace(/\bJN\.?\b/gi, 'Junction')
    .replace(/\bTRM\b|\bTRMUS\b|\bTERM\b/gi, 'Terminus')
    .replace(/\bCNTL\b|\bCTRL\b/gi, 'Central')
    .replace(/\bCANTT\b|\bCANT\b/gi, 'Cantt')
    .replace(/\s+H$/i, ' Halt')
    .replace(/\s+PH$/i, ' Halt')
    .replace(/\s+P\s+H$/i, ' Halt')
    .replace(/\s+F$/i, ' Flag');

  const titleCased = cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (['jn', 'ph', 'bg', 'mg', 'ng', 'rd'].includes(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  if (code === 'ROU' && !titleCased.includes('Junction')) {
    return 'Rourkela Junction';
  }
  if (code === 'RNC' && !titleCased.includes('Junction')) {
    return 'Ranchi Junction';
  }
  if (enrichment && code === 'MUV') {
    return 'Manduadih (Banaras)';
  }
  return titleCased;
}

export function normalizeStationsDataset(rawRecords: RawStationRecord[]): NormalizedStation[] {
  const seenCodes = new Set<string>();
  const normalized: NormalizedStation[] = [];

  for (const row of rawRecords) {
    if (!row || !row.CODE || !row.STATION_NAME) continue;
    const code = String(row.CODE).trim().toUpperCase();
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const rawName = String(row.STATION_NAME).trim().toUpperCase();
    const zone = String(row.RAILWAY_ZONE || 'UNKNOWN').trim().toUpperCase();
    const enrichment = STATION_ENRICHMENTS[code];
    const category = classifyStationCategory(rawName, code);
    const displayName = formatStationDisplayName(rawName, code);
    const aliases = enrichment?.aliases ? [...enrichment.aliases] : [];

    // Automatically add Junction/Jn variations
    if (rawName.includes('JN') || category === 'JUNCTION') {
      aliases.push(rawName.replace(/\bJN\.?\b/g, 'JUNCTION').toLowerCase());
    }

    const searchTokens = [
      code.toLowerCase(),
      rawName.toLowerCase(),
      displayName.toLowerCase(),
      zone.toLowerCase(),
      enrichment?.city?.toLowerCase() || '',
      enrichment?.state?.toLowerCase() || '',
      enrichment?.hindiName || '',
      ...aliases.map((a) => a.toLowerCase()),
    ]
      .filter(Boolean)
      .join(' | ');

    normalized.push({
      code,
      name: rawName,
      displayName,
      zone,
      zoneFullName: RAILWAY_ZONE_NAMES[zone] || zone,
      category,
      city: enrichment?.city,
      state: enrichment?.state,
      hindiName: enrichment?.hindiName,
      aliases,
      isMajorInterchange: Boolean(enrichment?.isMajorInterchange || category === 'JUNCTION' || category === 'CENTRAL' || category === 'TERMINUS'),
      searchTokens,
    });
  }

  return normalized;
}

export function auditStationsDataset(
  rawRecords: RawStationRecord[],
  sourcePath = 'data/Railway_stations.json'
): StationAuditReport {
  const codeSet = new Set<string>();
  const duplicateCodes: string[] = [];
  let missingCodeCount = 0;
  let missingNameCount = 0;
  let missingZoneCount = 0;
  const zoneDistribution: Record<string, number> = {};
  const categoryDistribution: Record<StationCategory, number> = {
    JUNCTION: 0,
    TERMINUS: 0,
    CENTRAL: 0,
    CANTT: 0,
    HALT: 0,
    REGULAR: 0,
  };
  const byName = new Map<string, Array<{ code: string; zone: string; displayName: string }>>();

  for (const row of rawRecords) {
    const code = (row?.CODE || '').trim().toUpperCase();
    const name = (row?.STATION_NAME || '').trim().toUpperCase();
    const zone = (row?.RAILWAY_ZONE || '').trim().toUpperCase();

    if (!code) missingCodeCount++;
    if (!name) missingNameCount++;
    if (!zone) missingZoneCount++;

    if (code) {
      if (codeSet.has(code)) {
        duplicateCodes.push(code);
      } else {
        codeSet.add(code);
      }
    }

    if (zone) {
      zoneDistribution[zone] = (zoneDistribution[zone] || 0) + 1;
    }

    const cat = classifyStationCategory(name, code);
    categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;

    if (name && code) {
      const list = byName.get(name) || [];
      list.push({ code, zone, displayName: formatStationDisplayName(name, code) });
      byName.set(name, list);
    }
  }

  const sharedNames = [...byName.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([name, stations]) => ({ name, stations }));

  return {
    sourcePath,
    synchronizedAt: '2026-10-29T06:28:00.000Z',
    totalRecords: rawRecords.length,
    uniqueCodes: codeSet.size,
    duplicateCodes,
    missingCodeCount,
    missingNameCount,
    missingZoneCount,
    sharedStationNamesCount: sharedNames.length,
    zoneDistribution,
    categoryDistribution,
    sampleDisambiguatedStations: sharedNames.slice(0, 8),
    status:
      duplicateCodes.length === 0 && missingCodeCount === 0 && missingNameCount === 0
        ? 'VALIDATED'
        : 'HAS_WARNINGS',
  };
}

/**
 * Compute bounded Levenshtein edit distance for typo-tolerant station queries
 */
export function levenshteinDistance(a: string, b: string, maxDist = 2): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[b.length];
}

/**
 * Strict canonical station-code identity check across the Indian railway network.
 * Never treats nearby stations (e.g., SRR vs TCR vs OTP, or ROU vs ROP vs BPO) as identical.
 */
export function areStationsStrictlyIdentical(codeA: string, codeB: string): boolean {
  const cleanA = (codeA || '').trim().toUpperCase();
  const cleanB = (codeB || '').trim().toUpperCase();
  if (!cleanA || !cleanB) return false;
  return cleanA === cleanB;
}

/**
 * Exact station lookup by unique station code (never substitutes another station).
 */
export function getStationByCode(
  stations: NormalizedStation[],
  code: string
): NormalizedStation | undefined {
  const target = (code || '').trim().toUpperCase();
  if (!target) return undefined;
  return stations.find((s) => s.code.toUpperCase() === target);
}

/**
 * Search and rank stations from the 8,938 nationwide station list.
 * Supports station code, station name, city/historical alias, Hindi/Devanagari, and typo tolerance.
 * Never confuses or substitutes exact station codes (e.g. ROU, ROP, BPO).
 */
export function searchStations(
  stations: NormalizedStation[],
  query: string,
  limit = 15,
  zoneFilter?: string
): NormalizedStation[] {
  const cleanQuery = (query || '').trim().toLowerCase();
  const pool = zoneFilter
    ? stations.filter((s) => s.zone.toUpperCase() === zoneFilter.toUpperCase())
    : stations;

  if (!cleanQuery) {
    // Return top major interchanges first when query is empty
    const priorityCodes = [
      'ROU',
      'BSB',
      'ROP',
      'BPO',
      'KGP',
      'RNC',
      'HTE',
      'TATA',
      'DHN',
      'GAYA',
      'DDU',
      'BKSC',
      'MURI',
      'PCOI',
      'BSP',
      'HWH',
      'NDLS',
      'PNBE',
      'CSMT',
      'MAS',
    ];
    const byCode = new Map(pool.map((s) => [s.code, s]));
    const featured = priorityCodes.map((c) => byCode.get(c)).filter(Boolean) as NormalizedStation[];
    if (featured.length >= limit) return featured.slice(0, limit);
    return [...featured, ...pool.filter((s) => !priorityCodes.includes(s.code))].slice(0, limit);
  }

  const scored: Array<{ station: NormalizedStation; score: number }> = [];

  for (const st of pool) {
    const codeLower = st.code.toLowerCase();
    const nameLower = st.name.toLowerCase();
    const displayLower = st.displayName.toLowerCase();
    const cityLower = (st.city || '').toLowerCase();
    const hindi = st.hindiName || '';

    let score = 0;

    // 1. Exact station code match — highest unconditional priority (10,000) so another station can never outrank an exact code
    if (codeLower === cleanQuery) {
      score = 10000;
    }
    // 2. Exact station name, display name, city, or alias match
    else if (
      nameLower === cleanQuery ||
      displayLower === cleanQuery ||
      cityLower === cleanQuery ||
      hindi === cleanQuery ||
      st.aliases.some((a) => a.toLowerCase() === cleanQuery)
    ) {
      score = 2000;
    }
    // 3. Station code prefix match
    else if (codeLower.startsWith(cleanQuery) && cleanQuery.length >= 2) {
      score = 900 - (codeLower.length - cleanQuery.length) * 15;
    }
    // 4. Station name or city prefix match
    else if (
      nameLower.startsWith(cleanQuery) ||
      displayLower.startsWith(cleanQuery) ||
      cityLower.startsWith(cleanQuery) ||
      (hindi && hindi.startsWith(cleanQuery))
    ) {
      score = 780;
    }
    // 5. Alias prefix match
    else if (st.aliases.some((a) => a.toLowerCase().startsWith(cleanQuery))) {
      score = 740;
    }
    // 6. Word boundary match inside station name or search tokens
    else if (
      nameLower.split(/\s+/).some((w) => w.startsWith(cleanQuery)) ||
      st.aliases.some((a) => a.toLowerCase().includes(cleanQuery))
    ) {
      score = 660;
    }
    // 7. Substring match in search tokens
    else if (st.searchTokens.includes(cleanQuery)) {
      score = 560;
    }
    // 8. Typo-tolerant Levenshtein match for queries >= 4 chars
    else if (cleanQuery.length >= 4) {
      const firstWord = nameLower.split(/\s+/)[0];
      const distName = levenshteinDistance(cleanQuery, firstWord, 2);
      const distCity = cityLower ? levenshteinDistance(cleanQuery, cityLower, 2) : 99;
      const minDist = Math.min(distName, distCity);
      if (minDist <= 1) {
        score = 480;
      } else if (minDist === 2 && cleanQuery.length >= 5) {
        score = 410;
      }
    }

    if (score > 0) {
      // Only apply tie-breaker boosts below exact-code tier so exact code matches are never altered
      if (score < 10000) {
        if (st.code in STATION_ENRICHMENTS) score += 35;
        if (st.category === 'JUNCTION' || st.category === 'CENTRAL' || st.category === 'TERMINUS') {
          score += 20;
        } else if (st.category === 'HALT') {
          score -= 25;
        }
      }
      scored.push({ station: st, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.station.code.localeCompare(b.station.code);
  });

  return scored.slice(0, limit).map((item) => item.station);
}

