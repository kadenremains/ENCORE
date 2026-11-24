import type { StoredScrobble } from './types';

/**
 * Demo listening history from January 2012 to today: real albums with their real release dates
 * (nothing is played before it came out), so the artwork lookups find the right covers.
 * Taste drifts over the years, new releases get a burst of plays when they drop, there are a
 * couple of long breaks (for "skip breaks") and a few standalone singles (for the singles setting).
 * Two stretches went through a second scrobbler that names things differently (singles, no album,
 * straight apostrophes, "feat." credits), so Clean up has real mismatches to show.
 */
interface Release {
  album: string;
  released: string; // yyyy-mm-dd
  tracks: string[]; // biggest songs first
}
interface Artist {
  name: string;
  /** how much this listener likes them (relative) */
  love: number;
  /** when this listener found them (yyyy-mm); never before their first release */
  since?: string;
  releases: Release[];
}

const CATALOG: Artist[] = [
  {
    name: 'Frank Ocean',
    love: 2.6,
    releases: [
      { album: 'channel ORANGE', released: '2012-07-10', tracks: ['Thinkin Bout You', 'Pyramids', 'Super Rich Kids', 'Lost', 'Sweet Life', 'Bad Religion', 'Pink Matter'] },
      { album: 'Blonde', released: '2016-08-20', tracks: ['Nikes', 'Ivy', 'Pink + White', 'Self Control', 'Nights', 'White Ferrari', 'Solo'] },
      { album: 'Chanel', released: '2017-03-10', tracks: ['Chanel'] },
    ],
  },
  {
    name: 'Kendrick Lamar',
    love: 2.0,
    releases: [
      { album: 'good kid, m.A.A.d city', released: '2012-10-22', tracks: ['Money Trees', 'Swimming Pools (Drank)', 'Bitch, Don’t Kill My Vibe', 'Backseat Freestyle', 'Poetic Justice', 'm.A.A.d city'] },
      { album: 'To Pimp a Butterfly', released: '2015-03-15', tracks: ['Alright', 'King Kunta', 'These Walls', 'i', 'The Blacker the Berry'] },
      { album: 'DAMN.', released: '2017-04-14', tracks: ['HUMBLE.', 'DNA.', 'LOVE.', 'LOYALTY.', 'ELEMENT.'] },
      { album: 'Mr. Morale & The Big Steppers', released: '2022-05-13', tracks: ['N95', 'Die Hard', 'Count Me Out', 'Rich Spirit', 'United In Grief'] },
      { album: 'GNX', released: '2024-11-22', tracks: ['luther', 'squabble up', 'tv off', 'wacced out murals', 'reincarnated'] },
    ],
  },
  {
    name: 'Tame Impala',
    love: 1.6,
    releases: [
      { album: 'Lonerism', released: '2012-10-05', tracks: ['Feels Like We Only Go Backwards', 'Elephant', 'Mind Mischief', 'Apocalypse Dreams'] },
      { album: 'Currents', released: '2015-07-17', tracks: ['The Less I Know the Better', 'Let It Happen', 'Eventually', 'New Person, Same Old Mistakes'] },
      { album: 'The Slow Rush', released: '2020-02-14', tracks: ['Borderline', 'Lost in Yesterday', 'Breathe Deeper'] },
    ],
  },
  {
    name: 'Arctic Monkeys',
    love: 1.5,
    releases: [
      { album: 'Favourite Worst Nightmare', released: '2007-04-23', tracks: ['505', 'Fluorescent Adolescent', 'Brianstorm'] },
      { album: 'AM', released: '2013-09-09', tracks: ['Do I Wanna Know?', 'R U Mine?', 'Why’d You Only Call Me When You’re High?', 'Arabella', 'I Wanna Be Yours', 'Snap Out of It'] },
      { album: 'Tranquility Base Hotel & Casino', released: '2018-05-11', tracks: ['Four Out of Five', 'Star Treatment'] },
    ],
  },
  {
    name: 'Lana Del Rey',
    love: 1.4,
    releases: [
      { album: 'Born to Die', released: '2012-01-27', tracks: ['Video Games', 'Summertime Sadness', 'Born to Die', 'Blue Jeans', 'National Anthem'] },
      { album: 'Norman Fucking Rockwell!', released: '2019-08-30', tracks: ['Mariners Apartment Complex', 'Venice Bitch', 'Norman fucking Rockwell', 'Doin’ Time'] },
      { album: 'Did you know that there’s a tunnel under Ocean Blvd', released: '2023-03-24', tracks: ['A&W', 'Kintsugi', 'The Grants'] },
    ],
  },
  {
    name: 'Kanye West',
    love: 1.3,
    releases: [
      { album: 'My Beautiful Dark Twisted Fantasy', released: '2010-11-22', tracks: ['Runaway', 'POWER', 'Devil In A New Dress', 'All Of The Lights'] },
      { album: 'Yeezus', released: '2013-06-18', tracks: ['Black Skinhead', 'Bound 2', 'Blood On The Leaves'] },
      { album: 'The Life of Pablo', released: '2016-02-14', tracks: ['Ultralight Beam', 'Father Stretch My Hands Pt. 1', 'Real Friends', 'Famous'] },
    ],
  },
  {
    name: 'The Weeknd',
    love: 1.2,
    releases: [
      { album: 'Kiss Land', released: '2013-09-10', tracks: ['Kiss Land', 'Belong to the World', 'Wanderlust'] },
      { album: 'Beauty Behind the Madness', released: '2015-08-28', tracks: ['The Hills', 'Can’t Feel My Face', 'Often'] },
      { album: 'Starboy', released: '2016-11-25', tracks: ['Starboy', 'I Feel It Coming', 'Party Monster', 'Die For You'] },
      { album: 'After Hours', released: '2020-03-20', tracks: ['Blinding Lights', 'Save Your Tears', 'After Hours', 'Faith'] },
    ],
  },
  {
    name: 'Radiohead',
    love: 1.1,
    releases: [
      { album: 'OK Computer', released: '1997-05-21', tracks: ['Karma Police', 'Paranoid Android', 'No Surprises', 'Let Down'] },
      { album: 'In Rainbows', released: '2007-10-10', tracks: ['Weird Fishes/Arpeggi', 'Nude', 'Reckoner', 'House of Cards', '15 Step'] },
      { album: 'A Moon Shaped Pool', released: '2016-05-08', tracks: ['Daydreaming', 'True Love Waits', 'Burn the Witch', 'Present Tense'] },
    ],
  },
  {
    name: 'Daft Punk',
    love: 0.9,
    releases: [
      { album: 'Discovery', released: '2001-03-12', tracks: ['One More Time', 'Digital Love', 'Harder, Better, Faster, Stronger'] },
      { album: 'Random Access Memories', released: '2013-05-17', tracks: ['Get Lucky', 'Instant Crush', 'Touch', 'Giorgio by Moroder', 'Lose Yourself to Dance'] },
    ],
  },
  {
    name: 'Bon Iver',
    love: 0.9,
    releases: [
      { album: 'For Emma, Forever Ago', released: '2008-02-19', tracks: ['Skinny Love', 'Re: Stacks', 'Flume', 'Blindsided'] },
      { album: 'Bon Iver, Bon Iver', released: '2011-06-17', tracks: ['Holocene', 'Perth', 'Towers'] },
      { album: '22, A Million', released: '2016-09-30', tracks: ['8 (circle)', '33 “GOD”', '29 #Strafford APTS'] },
    ],
  },
  {
    name: 'Fleetwood Mac',
    love: 0.8,
    releases: [{ album: 'Rumours', released: '1977-02-04', tracks: ['Dreams', 'The Chain', 'Go Your Own Way', 'Songbird', 'Never Going Back Again'] }],
  },
  {
    name: 'Björk',
    love: 0.6,
    releases: [
      { album: 'Homogenic', released: '1997-09-22', tracks: ['Jóga', 'Bachelorette', 'Hunter', 'All Is Full of Love'] },
      { album: 'Vespertine', released: '2001-08-27', tracks: ['Hidden Place', 'Pagan Poetry', 'Cocoon'] },
    ],
  },
  {
    name: 'Mac Miller',
    love: 1.3,
    since: '2013-06',
    releases: [
      { album: 'Watching Movies with the Sound Off', released: '2013-06-18', tracks: ['S.D.S.', 'Objects in the Mirror', 'Watching Movies'] },
      { album: 'The Divine Feminine', released: '2016-09-16', tracks: ['Dang!', 'Stay', 'My Favorite Part'] },
      { album: 'Swimming', released: '2018-08-03', tracks: ['Self Care', 'Ladders', 'Small Worlds', '2009'] },
      { album: 'Circles', released: '2020-01-17', tracks: ['Good News', 'Blue World', 'Circles'] },
    ],
  },
  {
    name: 'Lorde',
    love: 1.2,
    releases: [
      { album: 'Pure Heroine', released: '2013-09-27', tracks: ['Royals', 'Tennis Court', 'Team', 'Ribs', '400 Lux'] },
      { album: 'Melodrama', released: '2017-06-16', tracks: ['Green Light', 'Supercut', 'Liability', 'Writer in the Dark', 'Perfect Places'] },
      { album: 'Virgin', released: '2025-06-27', tracks: ['What Was That', 'Man of the Year', 'Hammer'] },
    ],
  },
  {
    name: 'Childish Gambino',
    love: 0.9,
    releases: [
      { album: 'Because the Internet', released: '2013-12-10', tracks: ['3005', 'Sweatpants', 'Telegraph Ave. ("Oakland" by Lloyd)'] },
      { album: '"Awaken, My Love!"', released: '2016-12-02', tracks: ['Redbone', 'Me and Your Mama', 'Terrified'] },
    ],
  },
  {
    name: 'Beyoncé',
    love: 1.1,
    releases: [
      { album: 'BEYONCÉ', released: '2013-12-13', tracks: ['Drunk in Love', 'Partition', 'XO', 'Pretty Hurts'] },
      { album: 'Lemonade', released: '2016-04-23', tracks: ['Formation', 'Hold Up', 'Sorry', 'All Night'] },
      { album: 'RENAISSANCE', released: '2022-07-29', tracks: ['CUFF IT', 'ALIEN SUPERSTAR', 'VIRGO’S GROOVE', 'BREAK MY SOUL'] },
      { album: 'COWBOY CARTER', released: '2024-03-29', tracks: ['TEXAS HOLD ’EM', 'II MOST WANTED', '16 CARRIAGES'] },
    ],
  },
  {
    name: 'Charli xcx',
    love: 1.2,
    since: '2014-08',
    releases: [
      { album: 'SUCKER', released: '2014-12-15', tracks: ['Boom Clap', 'Break the Rules', 'Doing It'] },
      { album: 'how i’m feeling now', released: '2020-05-15', tracks: ['claws', 'forever', 'anthems'] },
      { album: 'BRAT', released: '2024-06-07', tracks: ['360', 'Von dutch', 'Apple', 'Sympathy is a knife', 'Club classics', 'B2b'] },
    ],
  },
  {
    name: 'Tyler, The Creator',
    love: 2.0,
    since: '2015-01',
    releases: [
      { album: 'Wolf', released: '2013-04-02', tracks: ['IFHY', 'Answer', 'Treehome95'] },
      { album: 'Flower Boy', released: '2017-07-21', tracks: ['See You Again', 'Who Dat Boy', '911 / Mr. Lonely', 'Boredom', 'Glitter'] },
      { album: 'IGOR', released: '2019-05-17', tracks: ['EARFQUAKE', 'A BOY IS A GUN*', 'NEW MAGIC WAND', 'I THINK', 'RUNNING OUT OF TIME'] },
      { album: 'CALL ME IF YOU GET LOST', released: '2021-06-25', tracks: ['WUSYANAME', 'LUMBERJACK', 'SWEET / I THOUGHT YOU WANTED TO DANCE', 'RUNITUP'] },
      { album: 'CHROMAKOPIA', released: '2024-10-28', tracks: ['St. Chroma', 'Noid', 'Darling, I', 'Like Him', 'Sticky'] },
    ],
  },
  {
    name: 'Mitski',
    love: 1.3,
    since: '2016-07',
    releases: [
      { album: 'Puberty 2', released: '2016-06-17', tracks: ['Your Best American Girl', 'Happy', 'Once More to See You'] },
      { album: 'Be the Cowboy', released: '2018-08-17', tracks: ['Nobody', 'Washing Machine Heart', 'Two Slow Dancers', 'Geyser'] },
      { album: 'The Land Is Inhospitable and So Are We', released: '2023-09-15', tracks: ['My Love Mine All Mine', 'Bug Like an Angel', 'Heaven'] },
    ],
  },
  {
    name: 'SZA',
    love: 2.2,
    releases: [
      { album: 'Ctrl', released: '2017-06-09', tracks: ['Love Galore', 'The Weekend', 'Broken Clocks', 'Supermodel', 'Drew Barrymore', 'Garden (Say It Like Dat)'] },
      { album: 'SOS', released: '2022-12-09', tracks: ['Kill Bill', 'Snooze', 'Good Days', 'Nobody Gets Me', 'Shirt', 'Low', 'Blind'] },
      { album: 'SOS Deluxe: LANA', released: '2024-12-20', tracks: ['Saturn', '30 for 30', 'Drive'] },
    ],
  },
  {
    name: 'Phoebe Bridgers',
    love: 1.1,
    since: '2018-02',
    releases: [
      { album: 'Stranger in the Alps', released: '2017-09-22', tracks: ['Motion Sickness', 'Funeral', 'Scott Street'] },
      { album: 'Punisher', released: '2020-06-18', tracks: ['Kyoto', 'Garden Song', 'I Know the End', 'Moon Song'] },
    ],
  },
  {
    name: 'Kali Uchis',
    love: 1.0,
    releases: [
      { album: 'Isolation', released: '2018-04-06', tracks: ['After the Storm', 'Tyrant', 'Dead to Me', 'Feel Like a Fool'] },
      { album: 'Sin Miedo (del Amor y Otros Demonios) ∞', released: '2020-11-18', tracks: ['telepatía', 'fue mejor'] },
      { album: 'Red Moon in Venus', released: '2023-03-03', tracks: ['Moonlight', 'I Wish you Roses', 'Fantasy'] },
    ],
  },
  {
    name: 'Steve Lacy',
    love: 1.0,
    releases: [
      { album: 'Dark Red', released: '2017-02-20', tracks: ['Dark Red'] },
      { album: 'Apollo XXI', released: '2019-05-24', tracks: ['Playground', 'N Side', 'Like Me'] },
      { album: 'Gemini Rights', released: '2022-07-15', tracks: ['Bad Habit', 'Static', 'Helmet', 'Mercury'] },
    ],
  },
  {
    name: 'Clairo',
    love: 1.0,
    releases: [
      { album: 'Immunity', released: '2019-08-02', tracks: ['Bags', 'Sofia', 'North'] },
      { album: 'Sling', released: '2021-07-16', tracks: ['Blouse', 'Amoeba'] },
      { album: 'Charm', released: '2024-07-12', tracks: ['Sexy to Someone', 'Juna', 'Add Up My Love', 'Echo'] },
    ],
  },
  {
    name: 'Caroline Polachek',
    love: 0.8,
    releases: [
      { album: 'Pang', released: '2019-10-18', tracks: ['So Hot You’re Hurting My Feelings', 'Door', 'Pang'] },
      { album: 'Desire, I Want to Turn Into You', released: '2023-02-14', tracks: ['Welcome to My Island', 'Bunny Is a Rider', 'Sunset', 'Billions'] },
    ],
  },
  {
    name: 'Jai Paul',
    love: 0.6,
    releases: [{ album: 'Leak 04-13 (Bait Ones)', released: '2019-06-01', tracks: ['Str8 Outta Mumbai', 'Jasmine (Demo)', 'BTSTU (Demo)'] }],
  },
  {
    name: 'Fred again..',
    love: 1.0,
    releases: [
      { album: 'Actual Life (April 14 - December 17 2020)', released: '2021-04-16', tracks: ['Marea (we’ve lost dancing)', 'Kyle (i found you)'] },
      { album: 'Actual Life 3 (January 1 - September 9 2022)', released: '2022-10-28', tracks: ['Delilah (pull me out of this)', 'Clara (the night is dark)', 'Kammy (like i do)'] },
      { album: 'ten days', released: '2024-09-06', tracks: ['places to be', 'adore u', 'ten'] },
    ],
  },
  {
    name: 'Chappell Roan',
    love: 1.4,
    releases: [
      { album: 'The Rise and Fall of a Midwest Princess', released: '2023-09-22', tracks: ['Pink Pony Club', 'HOT TO GO!', 'Casual', 'Red Wine Supernova', 'Femininomenon'] },
      { album: 'Good Luck, Babe!', released: '2024-04-05', tracks: ['Good Luck, Babe!'] },
    ],
  },
  {
    name: 'Sabrina Carpenter',
    love: 1.1,
    since: '2024-04',
    releases: [
      { album: 'emails i can’t send', released: '2022-07-15', tracks: ['Nonsense', 'because i liked a boy', 'Fast Times'] },
      { album: 'Short n’ Sweet', released: '2024-08-23', tracks: ['Espresso', 'Please Please Please', 'Taste', 'Juno'] },
    ],
  },
];

/**
 * The long tail: artists discovered at some point, played a lot for a while, then now and then.
 * [artist, album, release date, songs (biggest first, | separated)]. Where the exact day was
 * unsure the date is a little late, never early.
 */
const LONG_TAIL: [string, string, string, string][] = [
  ['Billie Eilish', 'WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?', '2019-03-29', 'bad guy|when the party’s over|bury a friend'],
  ['Billie Eilish', 'HIT ME HARD AND SOFT', '2024-05-17', 'BIRDS OF A FEATHER|LUNCH|WILDFLOWER'],
  ['Olivia Rodrigo', 'SOUR', '2021-05-21', 'drivers license|good 4 u|deja vu|traitor'],
  ['Olivia Rodrigo', 'GUTS', '2023-09-08', 'vampire|bad idea right?|get him back!'],
  ['Taylor Swift', '1989', '2014-10-27', 'Blank Space|Style|Shake It Off'],
  ['Taylor Swift', 'folklore', '2020-07-24', 'cardigan|august|exile'],
  ['Harry Styles', 'Harry’s House', '2022-05-20', 'As It Was|Late Night Talking|Matilda'],
  ['Dua Lipa', 'Future Nostalgia', '2020-03-27', 'Levitating|Don’t Start Now|Physical'],
  ['Doja Cat', 'Planet Her', '2021-06-25', 'Kiss Me More|Need to Know|Woman'],
  ['Travis Scott', 'ASTROWORLD', '2018-08-03', 'SICKO MODE|STARGAZING|BUTTERFLY EFFECT'],
  ['Travis Scott', 'UTOPIA', '2023-07-28', 'FE!N|MY EYES|I KNOW ?'],
  ['Drake', 'Take Care', '2011-11-15', 'Marvins Room|Take Care|Headlines'],
  ['Drake', 'Nothing Was the Same', '2013-09-24', 'Hold On, We’re Going Home|Started From the Bottom|Too Much'],
  ['J. Cole', '2014 Forest Hills Drive', '2014-12-09', 'No Role Modelz|Love Yourz|Wet Dreamz'],
  ['Daniel Caesar', 'Freudian', '2017-08-25', 'Best Part|Get You|Hold Me Down'],
  ['Brent Faiyaz', 'WASTELAND', '2022-07-08', 'DEAD MAN WALKING|ALL MINE|WASTING TIME'],
  ['Giveon', 'TAKE TIME', '2020-03-27', 'Heartbreak Anniversary|Like I Want You'],
  ['Solange', 'A Seat at the Table', '2016-09-30', 'Cranes in the Sky|Don’t Touch My Hair|F.U.B.U.'],
  ['Erykah Badu', 'Baduizm', '1997-02-11', 'On & On|Next Lifetime|Otherside of the Game'],
  ['D’Angelo', 'Voodoo', '2000-01-25', 'Untitled (How Does It Feel)|Spanish Joint|Devil’s Pie'],
  ['Lauryn Hill', 'The Miseducation of Lauryn Hill', '1998-08-25', 'Ex-Factor|Doo Wop (That Thing)|To Zion'],
  ['Amy Winehouse', 'Back to Black', '2006-10-27', 'Back to Black|Rehab|Tears Dry on Their Own'],
  ['Earl Sweatshirt', 'Doris', '2013-08-20', 'Chum|Hive|Burgundy'],
  ['Vince Staples', 'Big Fish Theory', '2017-06-23', 'Big Fish|Yeah Right|BagBak'],
  ['Kid Cudi', 'Man on the Moon: The End of Day', '2009-09-15', 'Day ’N’ Nite (Nightmare)|Pursuit of Happiness|Soundtrack 2 My Life'],
  ['A$AP Rocky', 'LONG.LIVE.A$AP', '2013-01-15', 'Goldie|Wild for the Night|F**kin’ Problems'],
  ['Playboi Carti', 'Whole Lotta Red', '2020-12-25', 'Sky|Stop Breathing|Vamp Anthem'],
  ['Lil Uzi Vert', 'Luv Is Rage 2', '2017-08-25', 'XO TOUR Llif3|The Way Life Goes|Sauce It Up'],
  ['Metro Boomin', 'HEROES & VILLAINS', '2022-12-02', 'Superhero (Heroes & Villains)|Creepin’|Too Many Nights'],
  ['Joji', 'BALLADS 1', '2018-10-26', 'SLOW DANCING IN THE DARK|YEAH RIGHT|TEST DRIVE'],
  ['Rex Orange County', 'Pony', '2019-10-25', '10/10|Always|Pluto Projector'],
  ['Cigarettes After Sex', 'Cigarettes After Sex', '2017-06-09', 'Apocalypse|Sweet|K.'],
  ['Beach House', 'Bloom', '2012-05-15', 'Myth|Lazuli|Wild'],
  ['Beach House', 'Depression Cherry', '2015-08-28', 'Space Song|Levitation|Sparks'],
  ['Mac DeMarco', '2', '2012-10-16', 'Ode to Viceroy|Freaking Out the Neighborhood|My Kind of Woman'],
  ['Mac DeMarco', 'Salad Days', '2014-04-01', 'Chamber of Reflection|Salad Days|Let Her Go'],
  ['The Strokes', 'Is This It', '2001-07-30', 'Someday|Last Nite|Hard to Explain'],
  ['The Strokes', 'The New Abnormal', '2020-04-10', 'The Adults Are Talking|Bad Decisions|At the Door'],
  ['The 1975', 'The 1975', '2013-09-02', 'Chocolate|Robbers|Sex'],
  ['The 1975', 'I like it when you sleep, for you are so beautiful yet so unaware of it', '2016-02-26', 'Somebody Else|The Sound|A Change of Heart'],
  ['Vampire Weekend', 'Modern Vampires of the City', '2013-05-14', 'Step|Hannah Hunt|Diane Young'],
  ['Vampire Weekend', 'Father of the Bride', '2019-05-03', 'Harmony Hall|This Life|Sunflower'],
  ['MGMT', 'Oracular Spectacular', '2008-01-22', 'Electric Feel|Kids|Time to Pretend'],
  ['Glass Animals', 'How to Be a Human Being', '2016-08-26', 'Youth|Season 2 Episode 3|Pork Soda'],
  ['Glass Animals', 'Dreamland', '2020-08-07', 'Heat Waves|Tangerine|Your Love (Déjà Vu)'],
  ['Gorillaz', 'Demon Days', '2005-05-23', 'Feel Good Inc.|DARE|Kids with Guns'],
  ['Gorillaz', 'Plastic Beach', '2010-03-08', 'On Melancholy Hill|Stylo|Rhinestone Eyes'],
  ['Florence + The Machine', 'Lungs', '2009-07-06', 'Dog Days Are Over|Cosmic Love|You’ve Got the Love'],
  ['Paramore', 'After Laughter', '2017-05-12', 'Hard Times|Rose-Colored Boy|Told You So'],
  ['boygenius', 'the record', '2023-03-31', 'Not Strong Enough|Cool About It|$20'],
  ['Japanese Breakfast', 'Jubilee', '2021-06-04', 'Be Sweet|Kokomo, IN|Slide Tackle'],
  ['Weyes Blood', 'Titanic Rising', '2019-04-05', 'Andromeda|Everyday|Movies'],
  ['Big Thief', 'Dragon New Mountain I Believe in You', '2022-02-11', 'Change|Simulation Swarm|Little Things'],
  ['Snail Mail', 'Lush', '2018-06-08', 'Pristine|Heat Wave|Speaking Terms'],
  ['Soccer Mommy', 'Clean', '2018-03-02', 'Your Dog|Cool|Scorpio Rising'],
  ['Men I Trust', 'Oncle Jazz', '2019-09-27', 'Show Me How|Tailwhip|Numb'],
  ['KAYTRANADA', '99.9%', '2016-05-06', 'Glowed Up|Lite Spots|You’re the One'],
  ['Disclosure', 'Settle', '2013-06-03', 'Latch|White Noise|F for You'],
  ['Jamie xx', 'In Colour', '2015-05-29', 'Gosh|Loud Places|I Know There’s Gonna Be (Good Times)'],
  ['Flume', 'Skin', '2016-05-27', 'Never Be Like You|Say It|Smoke & Retribution'],
  ['ROSALÍA', 'El Mal Querer', '2018-11-02', 'MALAMENTE|PIENSO EN TU MIRÁ|DI MI NOMBRE'],
  ['ROSALÍA', 'MOTOMAMI', '2022-03-18', 'SAOKO|LA FAMA|CANDY'],
  ['Bad Bunny', 'Un Verano Sin Ti', '2022-05-06', 'Tití Me Preguntó|Me Porto Bonito|Moscow Mule'],
  ['Rihanna', 'ANTI', '2016-01-28', 'Needed Me|Work|Love on the Brain|Kiss It Better'],
  ['Jhené Aiko', 'Trip', '2017-09-22', 'While We’re Young|Sativa'],
  ['Summer Walker', 'Over It', '2019-10-04', 'Playing Games|Come Thru|Body'],
  ['Pusha T', 'DAYTONA', '2018-05-25', 'If You Know You Know|The Games We Play|Santeria'],
  ['Anderson .Paak', 'Malibu', '2016-01-15', 'Come Down|The Bird|Am I Wrong'],
  ['Thundercat', 'Drunk', '2017-02-24', 'Them Changes|Show You the Way|Friend Zone'],
  ['Omar Apollo', 'Ivory', '2022-04-08', 'Evergreen (You Didn’t Deserve Me at All)|Tamagotchi'],
  ['RAYE', 'My 21st Century Blues', '2023-02-03', 'Escapism.|Ice Cream Man|Black Mascara.'],
  ['PinkPantheress', 'to hell with it', '2021-10-15', 'Just for me|Pain|Break It Off'],
  ['Troye Sivan', 'Something to Give Each Other', '2023-10-13', 'Rush|One of Your Girls|Got Me Started'],
  ['Carly Rae Jepsen', 'EMOTION', '2015-08-21', 'Run Away with Me|Your Type|I Really Like You'],
  ['Robyn', 'Body Talk', '2010-11-22', 'Dancing On My Own|Call Your Girlfriend|Indestructible'],
  ['Grimes', 'Art Angels', '2015-11-06', 'Kill V. Maim|Flesh without Blood|California'],
  ['FKA twigs', 'LP1', '2014-08-11', 'Two Weeks|Pendulum|Video Girl'],
  ['James Blake', 'Overgrown', '2013-04-05', 'Retrograde|Overgrown|Life Round Here'],
  ['Sufjan Stevens', 'Carrie & Lowell', '2015-03-31', 'Should Have Known Better|Fourth of July|Death with Dignity'],
  ['Fleet Foxes', 'Helplessness Blues', '2011-05-03', 'Helplessness Blues|Montezuma|Grown Ocean'],
  ['Hozier', 'Hozier', '2014-09-19', 'Take Me to Church|Work Song|Someone New'],
  ['The Neighbourhood', 'I Love You.', '2013-04-22', 'Sweater Weather|Afraid|Let It Go'],
  ['Phoenix', 'Wolfgang Amadeus Phoenix', '2009-05-25', '1901|Lisztomania|Fences'],
  ['Foster the People', 'Torches', '2011-05-23', 'Pumped Up Kicks|Houdini|Helena Beat'],
  ['Two Door Cinema Club', 'Tourist History', '2010-03-01', 'What You Know|Undercover Martyn|I Can Talk'],
  ['Cocteau Twins', 'Heaven or Las Vegas', '1990-09-17', 'Heaven or Las Vegas|Cherry-Coloured Funk|Iceblink Luck'],
  ['Mazzy Star', 'So Tonight That I Might See', '1993-10-05', 'Fade Into You|Into Dust|Five String Serenade'],
  ['Portishead', 'Dummy', '1994-08-22', 'Glory Box|Sour Times|Roads'],
  ['Massive Attack', 'Mezzanine', '1998-04-20', 'Teardrop|Angel|Inertia Creeps'],
  ['Prince', 'Purple Rain', '1984-06-25', 'Purple Rain|When Doves Cry|Let’s Go Crazy'],
  ['Michael Jackson', 'Thriller', '1982-11-30', 'Billie Jean|Beat It|Human Nature'],
  ['Stevie Wonder', 'Songs in the Key of Life', '1976-09-28', 'Sir Duke|Isn’t She Lovely|As'],
  ['Marvin Gaye', 'What’s Going On', '1971-05-21', 'What’s Going On|Mercy Mercy Me (The Ecology)|Inner City Blues (Make Me Wanna Holler)'],
  ['Talking Heads', 'Remain in Light', '1980-10-08', 'Once in a Lifetime|Born Under Punches (The Heat Goes On)|Houses in Motion'],
  ['The Smiths', 'The Queen Is Dead', '1986-06-16', 'There Is a Light That Never Goes Out|Bigmouth Strikes Again|The Boy with the Thorn in His Side'],
  ['Kate Bush', 'Hounds of Love', '1985-09-16', 'Running Up That Hill (A Deal with God)|Cloudbusting|Hounds of Love'],
  ['The Beach Boys', 'Pet Sounds', '1966-05-16', 'God Only Knows|Wouldn’t It Be Nice|Sloop John B'],
  ['The Beatles', 'Abbey Road', '1969-09-26', 'Here Comes the Sun|Come Together|Something'],
  ['Nirvana', 'Nevermind', '1991-09-24', 'Smells Like Teen Spirit|Come as You Are|Lithium'],
  ['Deftones', 'White Pony', '2000-06-20', 'Change (In the House of Flies)|Digital Bath|Passenger'],
  ['Slowdive', 'Souvlaki', '1993-06-01', 'Alison|When the Sun Hits|40 Days'],
  ['My Bloody Valentine', 'Loveless', '1991-11-04', 'Only Shallow|Sometimes|When You Sleep'],
  ['Outkast', 'Speakerboxxx/The Love Below', '2003-09-23', 'Hey Ya!|Roses|The Way You Move'],
  ['Nas', 'Illmatic', '1994-04-19', 'N.Y. State of Mind|The World Is Yours|It Ain’t Hard to Tell'],
  ['Madvillain', 'Madvillainy', '2004-03-23', 'Accordion|All Caps|Rhinestone Cowboy'],
  ['A Tribe Called Quest', 'The Low End Theory', '1991-09-24', 'Scenario|Check the Rhime|Buggin’ Out'],
  ['Isaiah Rashad', 'The House Is Burning', '2021-07-30', 'Headshots (4r Da Locals)|Lay Wit Ya'],
  ['Noname', 'Room 25', '2018-09-14', 'Blaxploitation|Self|Montego Bae'],
  ['Saba', 'CARE FOR ME', '2018-04-05', 'LIFE|BUSY / SIRENS|PROM / KING'],
  ['Freddie Gibbs', 'Piñata', '2014-03-18', 'Thuggin’|Shitsville|Harold’s'],
  ['Denzel Curry', 'Melt My Eyez See Your Future', '2022-03-25', 'Walkin|Worst Comes to Worst|Ain’t No Way'],
  ['JID', 'The Forever Story', '2022-08-26', 'Surround Sound|Kody Blu 31|Dance Now'],
  ['Jungle', 'For Ever', '2018-09-14', 'Happy Man|Casio|Heavy, California'],
  ['Jungle', 'Volcano', '2023-08-11', 'Back On 74|Candle Flame|I’ve Been in Love'],
  ['Khruangbin', 'Con Todo El Mundo', '2018-01-26', 'Maria También|Friday Morning|Evan Finds the Third Room'],
  ['Unknown Mortal Orchestra', 'Multi-Love', '2015-05-26', 'Multi-Love|Can’t Keep Checking My Phone|Like Acid Rain'],
  ['Toro y Moi', 'Outer Peace', '2019-01-18', 'Ordinary Pleasure|Freelance|Laws of the Universe'],
  ['Washed Out', 'Within and Without', '2011-07-12', 'Eyes Be Closed|Amor Fati|Echoes'],
  ['Blood Orange', 'Freetown Sound', '2016-06-28', 'Augustine|Best to You|Hadron Collider'],
  ['Moses Sumney', 'Aromanticism', '2017-09-22', 'Doomed|Quarrel|Plastic'],
  ['beabadoobee', 'Beatopia', '2022-07-15', 'Talk|The Perfect Pair'],
  ['Laufey', 'Bewitched', '2023-09-08', 'From the Start|Promise|Bewitched'],
  ['Gracie Abrams', 'The Secret of Us', '2024-06-21', 'I Love You, I’m Sorry|Risk|Close to You'],
  ['Tinashe', 'Quantum Baby', '2024-08-16', 'Nasty|No Simpatico|Getting No Sleep'],
  ['Doechii', 'Alligator Bites Never Heal', '2024-08-30', 'DENIAL IS A RIVER|NISSAN ALTIMA|CATFISH'],
  ['Tems', 'Born in the Wild', '2024-06-07', 'Love Me JeJe|Me & U|Burning'],
];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
};

/** Weighted pick: index into `w` for a random `x` in [0, sum of w). */
function pick(w: number[], x: number) {
  let i = 0;
  while (x > w[i] && i < w.length - 1) x -= w[i++];
  return i;
}

const START = new Date(2012, 0, 9);
// two long stretches away from music (for the "skip breaks" setting)
const BREAKS: [string, string][] = [
  ['2015-06-14', '2015-07-26'],
  ['2019-08-03', '2019-09-15'],
];
const HOURS = [3, 2, 1, 0.5, 0.3, 0.3, 0.8, 2, 4, 5, 5, 5, 6, 6, 5, 5, 6, 7, 8, 9, 9, 8, 7, 5];

export function generateDemo(): StoredScrobble[] {
  const r = rng(2012);
  const now = Date.now();
  const nowDate = new Date();
  const totalDays = Math.floor((nowDate.getTime() - START.getTime()) / 86400000);
  const hourTotal = HOURS.reduce((a, b) => a + b, 0);
  const breaks = BREAKS.map(([a, b]) => [day(a), day(b)]);

  // the long tail, grouped per artist: each is found at some point after its first release,
  // played a lot for a while, then only now and then
  const tail = new Map<string, Release[]>();
  for (const [artist, album, released, songs] of LONG_TAIL) {
    if (!tail.has(artist)) tail.set(artist, []);
    tail.get(artist)!.push({ album, released, tracks: songs.split('|') });
  }
  const lastDay = nowDate.getTime() - 20 * 86400000;
  const all: (Artist & { found?: number; hot?: number })[] = [...CATALOG];
  for (const [name, releases] of tail) {
    const first = Math.max(START.getTime(), Math.min(...releases.map((x) => day(x.released))));
    // half of the older records are already in your library when the history starts
    const older = Math.min(...releases.map((x) => day(x.released))) < START.getTime();
    const found = older && r() < 0.5 ? START.getTime() : first + r() * Math.max(0, lastDay - first);
    all.push({ name, love: 0.3 + r() ** 2 * 1.3, releases, found, hot: 60 + r() * 600 });
  }

  const artists = all.map((a) => {
    const first = Math.min(...a.releases.map((x) => day(x.released)));
    return {
      ...a,
      from: Math.max(first, a.since ? day(`${a.since}-01`) : 0, a.found ?? 0),
      phase: r() * Math.PI * 2,
      period: 300 + r() * 900, // days per swing in how much they're played
      releases: a.releases.map((x) => ({ ...x, at: day(x.released), trackW: x.tracks.map((_, i) => 1 / (i + 1) ** 0.7 * (0.6 + r() * 0.8)) })),
    };
  });

  const out: StoredScrobble[] = [];
  for (let d = 0; d <= totalDays; d++) {
    const date = new Date(START.getFullYear(), START.getMonth(), START.getDate() + d);
    const t0 = date.getTime();
    if (breaks.some(([a, b]) => t0 >= a && t0 <= b)) continue;
    // listening grows over the years: ~14 a day in 2012 to ~45 now
    const years = d / 365;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    let n = Math.round((14 + years * 2.3) * (weekend ? 0.8 : 1) * (0.4 + r() * 1.2));
    if (r() < 0.05) n = 0;
    if (r() < 0.03) n = Math.round(n * 2.6);
    if (!n) continue;

    // who's in rotation today: affection x a slow swing x a burst after new releases
    const albumW: { a: number; r: number; w: number }[] = [];
    for (let ai = 0; ai < artists.length; ai++) {
      const a = artists[ai];
      if (t0 < a.from) continue;
      const swing = (1.15 + Math.sin((d / a.period) * Math.PI * 2 + a.phase)) ** 2;
      // long-tail artists: in heavy rotation for a while after you find them, then occasional
      const sinceFound = a.found !== undefined ? (t0 - a.from) / 86400000 : 0;
      const rotation = a.found === undefined ? 1 : sinceFound < (a.hot ?? 0) ? 2.6 : 0.25 + 0.8 * Math.exp(-(sinceFound - (a.hot ?? 0)) / 240);
      for (let ri = 0; ri < a.releases.length; ri++) {
        const rel = a.releases[ri];
        if (t0 < rel.at) continue;
        const age = (t0 - rel.at) / 86400000;
        const burst = age < 150 ? 1 + 5 * Math.exp(-age / 35) : 1;
        // older records fade to a steady "classic" level
        const fade = 0.35 + 0.65 * Math.exp(-Math.max(0, age) / 900);
        const single = rel.tracks.length === 1 ? 0.35 : 1;
        albumW.push({ a: ai, r: ri, w: a.love * swing * burst * fade * single * rotation });
      }
    }
    if (!albumW.length) continue;
    const weights = albumW.map((x) => x.w);
    const wTotal = weights.reduce((s, v) => s + v, 0);

    for (let k = 0; k < n; k++) {
      const choice = albumW[pick(weights, r() * wTotal)];
      const a = artists[choice.a];
      const rel = a.releases[choice.r];
      const tt = rel.trackW.reduce((s, v) => s + v, 0);
      const ti = pick(rel.trackW, r() * tt);
      const hour = pick(HOURS, r() * hourTotal);
      const ts = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Math.floor(r() * 60), Math.floor(r() * 60)).getTime() / 1000);
      if (ts * 1000 > now) continue;
      out.push({ ts, ar: a.name, al: rel.album, tr: rel.tracks[ti] });
    }
  }
  messUp(out);
  return out.sort((a, b) => a.ts - b.ts);
}

/** Songs that really came out as singles too (the single exists, so playing it later is fine). */
const SINGLE_TOO = new Set(['Blinding Lights', 'HUMBLE.', 'The Less I Know the Better', 'Do I Wanna Know?', 'Redbone', 'Good Days', 'Espresso', 'Please Please Please']);
/** Songs whose full credit includes a featured artist. */
const FEAT: Record<string, string> = { 'Money Trees': 'Money Trees (feat. Jay Rock)', 'I Feel It Coming': 'I Feel It Coming (feat. Daft Punk)' };

/**
 * A second scrobbler (a car stereo, then a new phone app) that names things its own way. Only names
 * change, never dates, and only to names that really exist (real singles, real credits, Born to
 * Die's Paradise Edition, which came out in Nov 2012).
 */
function messUp(out: StoredScrobble[]) {
  const r = rng(77);
  const car = [day('2017-03-01') / 1000, day('2018-11-01') / 1000];
  const app = [day('2021-02-01') / 1000, day('2022-06-01') / 1000];
  for (const s of out) {
    if (s.ts >= car[0] && s.ts < car[1]) {
      if (r() < 0.45) continue;
      s.tr = s.tr.replace(/\u2019/g, "'");
      s.al = s.al.replace(/\u2019/g, "'");
      if (s.ar === 'Beyoncé' && r() < 0.6) s.ar = 'Beyonce';
      if (s.ar === 'Tyler, The Creator' && r() < 0.5) s.ar = 'Tyler The Creator';
      if (s.al === 'Born to Die') s.al = 'Born To Die - The Paradise Edition';
      if (s.tr === 'Go Your Own Way') s.tr = 'Go Your Own Way - 2004 Remaster';
      if (SINGLE_TOO.has(s.tr) && r() < 0.6) s.al = `${s.tr} - Single`;
      else if (r() < 0.004) s.al = '';
    } else if (s.ts >= app[0] && s.ts < app[1]) {
      if (FEAT[s.tr] && r() < 0.7) s.tr = FEAT[s.tr];
      if (SINGLE_TOO.has(s.tr) && r() < 0.4) s.al = `${s.tr} - Single`;
    } else if (SINGLE_TOO.has(s.tr) && r() < 0.04) s.al = `${s.tr} - Single`;
  }
}
