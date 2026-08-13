// Static database of popular Indian trains for instant offline search.
// The live API is used only for tracking — search stays fast and offline.

export interface TrainEntry {
  number: string;
  name: string;
  from: string;
  fromCode: string;
  to: string;
  toCode: string;
}

export const TRAINS_DB: TrainEntry[] = [
  // Rajdhani Express
  { number: '12951', name: 'New Delhi Tejas Rajdhani Express', from: 'Mumbai Central', fromCode: 'MMCT', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12952', name: 'Mumbai Tejas Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Mumbai Central', toCode: 'MMCT' },
  { number: '12301', name: 'Howrah Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Howrah', toCode: 'HWH' },
  { number: '12302', name: 'New Delhi Rajdhani Express', from: 'Howrah', fromCode: 'HWH', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12303', name: 'Poorva Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Howrah', toCode: 'HWH' },
  { number: '12305', name: 'Howrah Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Howrah', toCode: 'HWH' },
  { number: '12309', name: 'Patna Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Patna Junction', toCode: 'PNBE' },
  { number: '12313', name: 'Sealdah Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Sealdah', toCode: 'SDAH' },
  { number: '12431', name: 'Thiruvananthapuram Rajdhani', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Thiruvananthapuram', toCode: 'TVC' },
  { number: '12433', name: 'Chennai Rajdhani Express', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Chennai Central', toCode: 'MAS' },
  { number: '12435', name: 'Dibrugarh Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Dibrugarh', toCode: 'DBRG' },
  { number: '12439', name: 'Ranchi Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Ranchi', toCode: 'RNC' },
  { number: '12423', name: 'Dibrugarh Rajdhani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Dibrugarh Town', toCode: 'DBRT' },
  { number: '12453', name: 'Rajdhani Express', from: 'Ranchi', fromCode: 'RNC', to: 'New Delhi', toCode: 'NDLS' },
  // Shatabdi Express
  { number: '12001', name: 'Bhopal Shatabdi Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Bhopal', toCode: 'BPL' },
  { number: '12002', name: 'Bhopal Shatabdi Express', from: 'Habibganj', fromCode: 'HBJ', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12003', name: 'Lucknow Swarna Shatabdi', from: 'New Delhi', fromCode: 'NDLS', to: 'Lucknow', toCode: 'LKO' },
  { number: '12007', name: 'Chennai Shatabdi Express', from: 'Mysuru', fromCode: 'MYS', to: 'Chennai Central', toCode: 'MAS' },
  { number: '12009', name: 'Mumbai Shatabdi Express', from: 'Mumbai Central', fromCode: 'MMCT', to: 'Ahmedabad', toCode: 'ADI' },
  { number: '12011', name: 'Kalka Shatabdi Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Kalka', toCode: 'KLK' },
  { number: '12013', name: 'Amritsar Shatabdi Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Amritsar', toCode: 'ASR' },
  { number: '12015', name: 'Ajmer Shatabdi Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Ajmer', toCode: 'AII' },
  { number: '12017', name: 'Dehradun Shatabdi Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Dehradun', toCode: 'DDN' },
  { number: '12019', name: 'Howrah Shatabdi Express', from: 'Howrah', fromCode: 'HWH', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12021', name: 'Howrah Shatabdi Express', from: 'Howrah', fromCode: 'HWH', to: 'Ranchi', toCode: 'RNC' },
  { number: '12023', name: 'Patna Shatabdi Express', from: 'Howrah', fromCode: 'HWH', to: 'Patna Junction', toCode: 'PNBE' },
  { number: '12025', name: 'Pune Shatabdi Express', from: 'Pune', fromCode: 'PUNE', to: 'Mumbai CST', toCode: 'CSMT' },
  { number: '12027', name: 'Chennai Shatabdi Express', from: 'Chennai Central', fromCode: 'MAS', to: 'Bangalore City', toCode: 'SBC' },
  // Vande Bharat Express
  { number: '22436', name: 'Varanasi Vande Bharat Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Varanasi Junction', toCode: 'BSB' },
  { number: '22435', name: 'New Delhi Vande Bharat Express', from: 'Varanasi Junction', fromCode: 'BSB', to: 'New Delhi', toCode: 'NDLS' },
  { number: '20901', name: 'Mumbai Vande Bharat Express', from: 'Mumbai CST', fromCode: 'CSMT', to: 'Solapur', toCode: 'SUR' },
  { number: '20903', name: 'Chennai Vande Bharat Express', from: 'Chennai Central', fromCode: 'MAS', to: 'Coimbatore', toCode: 'CBE' },
  { number: '20905', name: 'Patna Vande Bharat Express', from: 'Patna Junction', fromCode: 'PNBE', to: 'Howrah', toCode: 'HWH' },
  { number: '20911', name: 'Rani Kamlapati Vande Bharat', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Rani Kamlapati', toCode: 'HBJ' },
  { number: '22221', name: 'Mumbai Vande Bharat Express', from: 'Mumbai CST', fromCode: 'CSMT', to: 'Shirdi', toCode: 'SAI' },
  { number: '22223', name: 'Amritsar Vande Bharat Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Amritsar', toCode: 'ASR' },
  { number: '22229', name: 'Howrah Vande Bharat Express', from: 'Howrah', fromCode: 'HWH', to: 'New Jalpaiguri', toCode: 'NJP' },
  { number: '22231', name: 'Lucknow Vande Bharat Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Lucknow', toCode: 'LKO' },
  { number: '20951', name: 'Ahmedabad Vande Bharat Express', from: 'Ahmedabad', fromCode: 'ADI', to: 'Mumbai Central', toCode: 'MMCT' },
  { number: '20971', name: 'Gorakhpur Vande Bharat', from: 'Lucknow', fromCode: 'LKO', to: 'Gorakhpur', toCode: 'GKP' },
  // Duronto Express
  { number: '12259', name: 'Sealdah Duronto Express', from: 'Sealdah', fromCode: 'SDAH', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12260', name: 'New Delhi Duronto Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Sealdah', toCode: 'SDAH' },
  { number: '12263', name: 'Pune Duronto Express', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Pune Junction', toCode: 'PUNE' },
  { number: '12269', name: 'Mumbai Duronto Express', from: 'Chennai Central', fromCode: 'MAS', to: 'Mumbai LTT', toCode: 'LTT' },
  // Express Trains
  { number: '12621', name: 'Tamil Nadu Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Chennai Central', toCode: 'MAS' },
  { number: '12622', name: 'Tamil Nadu Express', from: 'Chennai Central', fromCode: 'MAS', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12625', name: 'Kerala Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Thiruvananthapuram', toCode: 'TVC' },
  { number: '12626', name: 'Kerala Express', from: 'Thiruvananthapuram', fromCode: 'TVC', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12627', name: 'Karnataka Express', from: 'New Delhi', fromCode: 'NDLS', to: 'KSR Bengaluru City', toCode: 'SBC' },
  { number: '12628', name: 'Karnataka Express', from: 'KSR Bengaluru City', fromCode: 'SBC', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12649', name: 'Karnataka Sampark Kranti', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'KSR Bengaluru City', toCode: 'SBC' },
  { number: '12650', name: 'Karnataka Sampark Kranti', from: 'KSR Bengaluru City', fromCode: 'SBC', to: 'Hazrat Nizamuddin', toCode: 'NZM' },
  { number: '12723', name: 'Telangana Express', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Hyderabad', toCode: 'HYB' },
  { number: '12724', name: 'Telangana Express', from: 'Hyderabad', fromCode: 'HYB', to: 'Hazrat Nizamuddin', toCode: 'NZM' },
  { number: '12685', name: 'Mangalore Express', from: 'Chennai Central', fromCode: 'MAS', to: 'Mangalore', toCode: 'MAQ' },
  { number: '12686', name: 'Chennai Express', from: 'Mangalore', fromCode: 'MAQ', to: 'Chennai Central', toCode: 'MAS' },
  { number: '12101', name: 'Jnaneshwari Deluxe Express', from: 'Mumbai LTT', fromCode: 'LTT', to: 'Howrah', toCode: 'HWH' },
  { number: '12102', name: 'Jnaneshwari Deluxe Express', from: 'Howrah', fromCode: 'HWH', to: 'Mumbai LTT', toCode: 'LTT' },
  // Superfast / SF
  { number: '12561', name: 'Swatantrata Senani Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Rajgir', toCode: 'RGR' },
  { number: '12471', name: 'Swaraj Express', from: 'Jammu Tawi', fromCode: 'JAT', to: 'Indore', toCode: 'INDB' },
  { number: '12691', name: 'Chennai Express', from: 'Nagercoil', fromCode: 'NCJ', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12141', name: 'Patna Express', from: 'Mumbai LTT', fromCode: 'LTT', to: 'Patna Junction', toCode: 'PNBE' },
  { number: '12229', name: 'Lucknow Mail', from: 'New Delhi', fromCode: 'NDLS', to: 'Lucknow', toCode: 'LKO' },
  { number: '12903', name: 'Golden Temple Mail', from: 'Mumbai Central', fromCode: 'MMCT', to: 'Amritsar', toCode: 'ASR' },
  { number: '12904', name: 'Golden Temple Mail', from: 'Amritsar', fromCode: 'ASR', to: 'Mumbai Central', toCode: 'MMCT' },
  { number: '14003', name: 'Delhi Sarai Rohilla Express', from: 'Delhi Sarai Rohilla', fromCode: 'DEE', to: 'New Delhi', toCode: 'NDLS' },
  { number: '12651', name: 'Millenium Express', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Chennai Central', toCode: 'MAS' },
  { number: '12213', name: 'Yesvantpur Duronto Express', from: 'Delhi Sarai Rohilla', fromCode: 'DEE', to: 'Yesvantpur', toCode: 'YPR' },
  { number: '12401', name: 'Nandan Kanan Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Bhubaneswar', toCode: 'BBS' },
  { number: '22691', name: 'Rajdhani Express', from: 'KSR Bengaluru City', fromCode: 'SBC', to: 'Hazrat Nizamuddin', toCode: 'NZM' },
  { number: '22692', name: 'Rajdhani Express', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'KSR Bengaluru City', toCode: 'SBC' },
  { number: '22687', name: 'Yesvantpur Rajdhani Express', from: 'Yesvantpur', fromCode: 'YPR', to: 'Hazrat Nizamuddin', toCode: 'NZM' },
  { number: '22688', name: 'Hazrat Nizamuddin Rajdhani', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Yesvantpur', toCode: 'YPR' },
  { number: '12615', name: 'Grand Trunk Express', from: 'New Delhi', fromCode: 'NDLS', to: 'Chennai Central', toCode: 'MAS' },
  { number: '12616', name: 'Grand Trunk Express', from: 'Chennai Central', fromCode: 'MAS', to: 'New Delhi', toCode: 'NDLS' },
  { number: '16315', name: 'Kochuveli Express', from: 'Thiruvananthapuram', fromCode: 'KCVL', to: 'Bangalore City', toCode: 'SBC' },
  { number: '16316', name: 'Kochuveli Express', from: 'Bangalore City', fromCode: 'SBC', to: 'Thiruvananthapuram', toCode: 'KCVL' },
  { number: '12163', name: 'Dadar Chennai Express', from: 'Dadar', fromCode: 'DR', to: 'Chennai Central', toCode: 'MAS' },
  { number: '12187', name: 'Jabalpur Garib Rath Express', from: 'Mumbai LTT', fromCode: 'LTT', to: 'Jabalpur', toCode: 'JBP' },
  { number: '12953', name: 'August Kranti Rajdhani Express', from: 'Mumbai Central', fromCode: 'MMCT', to: 'Hazrat Nizamuddin', toCode: 'NZM' },
  { number: '12954', name: 'August Kranti Rajdhani Express', from: 'Hazrat Nizamuddin', fromCode: 'NZM', to: 'Mumbai Central', toCode: 'MMCT' },
  { number: '12025', name: 'Shatabdi Express', from: 'Pune Junction', fromCode: 'PUNE', to: 'Mumbai CST', toCode: 'CSMT' },
  { number: '12959', name: 'Dadar Shatabdi Express', from: 'Dadar', fromCode: 'DR', to: 'Ahmedabad', toCode: 'ADI' },
  { number: '15005', name: 'Rapti Sagar Express', from: 'Guwahati', fromCode: 'GHY', to: 'Delhi Anand Vihar', toCode: 'ANVT' },
  { number: '12595', name: 'Gorakhpur Express', from: 'Anand Vihar Terminal', fromCode: 'ANVT', to: 'Gorakhpur', toCode: 'GKP' },
];

/**
 * Search trains from the static database.
 * Matches against number, name, from/to station names and codes.
 */
export function searchLocalTrains(query: string): TrainEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return TRAINS_DB.slice(0, 12); // Return popular trains if no query

  return TRAINS_DB.filter(
    (t) =>
      t.number.startsWith(q) ||
      t.name.toLowerCase().includes(q) ||
      t.from.toLowerCase().includes(q) ||
      t.to.toLowerCase().includes(q) ||
      t.fromCode.toLowerCase().includes(q) ||
      t.toCode.toLowerCase().includes(q)
  ).slice(0, 15);
}
