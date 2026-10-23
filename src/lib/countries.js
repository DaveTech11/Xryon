// [ISO code, name, dial code] for the phone picker. Add more rows if you need them.
export const COUNTRIES = [
  ["US", "United States", "1"], ["NG", "Nigeria", "234"], ["GB", "United Kingdom", "44"], ["CA", "Canada", "1"],
  ["GH", "Ghana", "233"], ["KE", "Kenya", "254"], ["ZA", "South Africa", "27"], ["IN", "India", "91"],
  ["AU", "Australia", "61"], ["DE", "Germany", "49"], ["FR", "France", "33"], ["IT", "Italy", "39"],
  ["ES", "Spain", "34"], ["PT", "Portugal", "351"], ["NL", "Netherlands", "31"], ["BE", "Belgium", "32"],
  ["CH", "Switzerland", "41"], ["SE", "Sweden", "46"], ["NO", "Norway", "47"], ["DK", "Denmark", "45"],
  ["FI", "Finland", "358"], ["IE", "Ireland", "353"], ["PL", "Poland", "48"], ["RO", "Romania", "40"],
  ["GR", "Greece", "30"], ["TR", "Türkiye", "90"], ["UA", "Ukraine", "380"], ["RU", "Russia", "7"],
  ["AE", "United Arab Emirates", "971"], ["SA", "Saudi Arabia", "966"], ["QA", "Qatar", "974"], ["IL", "Israel", "972"],
  ["EG", "Egypt", "20"], ["MA", "Morocco", "212"], ["DZ", "Algeria", "213"], ["TN", "Tunisia", "216"],
  ["ET", "Ethiopia", "251"], ["TZ", "Tanzania", "255"], ["UG", "Uganda", "256"], ["RW", "Rwanda", "250"],
  ["ZM", "Zambia", "260"], ["ZW", "Zimbabwe", "263"], ["CM", "Cameroon", "237"], ["CI", "Côte d'Ivoire", "225"],
  ["SN", "Senegal", "221"], ["BJ", "Benin", "229"], ["TG", "Togo", "228"], ["SL", "Sierra Leone", "232"],
  ["LR", "Liberia", "231"], ["GM", "Gambia", "220"], ["AO", "Angola", "244"], ["MZ", "Mozambique", "258"],
  ["NA", "Namibia", "264"], ["BW", "Botswana", "267"], ["CD", "DR Congo", "243"], ["SD", "Sudan", "249"],
  ["PK", "Pakistan", "92"], ["BD", "Bangladesh", "880"], ["LK", "Sri Lanka", "94"], ["NP", "Nepal", "977"],
  ["CN", "China", "86"], ["HK", "Hong Kong", "852"], ["JP", "Japan", "81"], ["KR", "South Korea", "82"],
  ["SG", "Singapore", "65"], ["MY", "Malaysia", "60"], ["ID", "Indonesia", "62"], ["PH", "Philippines", "63"],
  ["TH", "Thailand", "66"], ["VN", "Vietnam", "84"], ["NZ", "New Zealand", "64"],
  ["MX", "Mexico", "52"], ["BR", "Brazil", "55"], ["AR", "Argentina", "54"], ["CL", "Chile", "56"],
  ["CO", "Colombia", "57"], ["PE", "Peru", "51"], ["VE", "Venezuela", "58"], ["JM", "Jamaica", "1876"],
  ["TT", "Trinidad and Tobago", "1868"], ["DO", "Dominican Republic", "1809"],
];

// Picks a starting country from the browser language (en-NG -> Nigeria), otherwise the United States.
export function guessCountry() {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const region = String(l || "").split("-")[1]?.toUpperCase();
      const hit = region && COUNTRIES.find((c) => c[0] === region);
      if (hit) return hit;
    }
  } catch { /* ignore */ }
  return COUNTRIES[0];
}

export const flagUrl = (iso) => `https://flagcdn.com/w40/${iso.toLowerCase()}.png`;
