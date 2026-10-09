/** Sample media library (Google's public GTV sample bucket) used by Local Plex and Live IPTV. */
const BASE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';

export interface Movie {
  id: string;
  title: string;
  year: number;
  rating: string;
  minutes: number;
  genre: string;
  kind: 'movie' | 'show';
  summary: string;
  src: string;
  thumb: string;
  colors: [string, string];
}

const m = (id: string, file: string, title: string, year: number, minutes: number, genre: string, kind: Movie['kind'], colors: [string, string], summary: string, rating = 'PG'): Movie => ({
  id,
  title,
  year,
  rating,
  minutes,
  genre,
  kind,
  summary,
  src: `${BASE}/${file}.mp4`,
  thumb: `${BASE}/images/${file}.jpg`,
  colors,
});

export const LIBRARY: Movie[] = [
  m('bbb', 'BigBuckBunny', 'Big Buck Bunny', 2008, 10, 'Animation', 'movie', ['#65a30d', '#1e3a8a'], 'A giant rabbit with a heart bigger than himself takes on three bullying rodents in a lush, sunlit forest.', 'G'),
  m('ed', 'ElephantsDream', 'Elephants Dream', 2006, 11, 'Sci-Fi', 'movie', ['#78350f', '#1f2937'], 'Two strange characters explore a capricious and seemingly infinite machine — the world’s first open movie.'),
  m('sintel', 'Sintel', 'Sintel', 2010, 15, 'Fantasy', 'movie', ['#991b1b', '#0f172a'], 'A lonely young woman searches the wilderness for the baby dragon she once rescued and raised.', 'PG-13'),
  m('tos', 'TearsOfSteel', 'Tears of Steel', 2012, 12, 'Sci-Fi', 'movie', ['#0e7490', '#111827'], 'In a future Amsterdam, a group of warriors and scientists attempt to rescue the world from destructive robots.', 'PG-13'),
  m('blazes', 'ForBiggerBlazes', 'For Bigger Blazes', 2014, 1, 'Short', 'show', ['#ea580c', '#7c2d12'], 'Episode 1 — a vibrant showcase of bigger screens and brighter moments.'),
  m('escapes', 'ForBiggerEscapes', 'For Bigger Escapes', 2014, 1, 'Short', 'show', ['#0284c7', '#0c4a6e'], 'Episode 2 — escape into breathtaking scenery on the biggest screen in the house.'),
  m('fun', 'ForBiggerFun', 'For Bigger Fun', 2014, 1, 'Short', 'show', ['#db2777', '#4c1d95'], 'Episode 3 — game nights, music and laughter, all cast to the TV.'),
  m('joy', 'ForBiggerJoyrides', 'For Bigger Joyrides', 2014, 1, 'Short', 'show', ['#16a34a', '#14532d'], 'Episode 4 — take the passenger seat on thrilling rides.'),
  m('melt', 'ForBiggerMeltdowns', 'For Bigger Meltdowns', 2014, 1, 'Short', 'show', ['#f59e0b', '#78350f'], 'Episode 5 — when the little ones need a distraction, the big screen saves the day.'),
  m('subaru', 'SubaruOutbackOnStreetAndDirt', 'Outback: Street & Dirt', 2015, 9, 'Automotive', 'show', ['#475569', '#0f172a'], 'A long-term review on paved roads and rugged dirt tracks.'),
  m('gti', 'VolkswagenGTIReview', 'GTI Review', 2015, 10, 'Automotive', 'show', ['#dc2626', '#111827'], 'Is the hot hatch still the benchmark? A full road test.'),
  m('bullrun', 'WeAreGoingOnBullrun', 'We Are Going On Bullrun', 2015, 8, 'Documentary', 'show', ['#ca8a04', '#1c1917'], 'Behind the scenes of a cross-country supercar rally.'),
  m('grand', 'WhatCarCanYouGetForAGrand', 'What Car For a Grand?', 2015, 9, 'Documentary', 'show', ['#7c3aed', '#1e1b4b'], 'How much car can one thousand dollars actually buy?'),
];
