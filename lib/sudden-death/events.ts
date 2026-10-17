import { question } from '@/lib/sudden-death/bank';
import type { QuestionBank } from '@/lib/sudden-death/codec';

export type EventKind = 'quiz' | 'lyric' | 'place' | 'translate' | 'chant';

export type EventPreset = {
  id: EventKind;
  title: string;
  blurb: string;
  cover: string;
  bank: QuestionBank;
};

const FEE = 50n * 100_000_000n;

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: 'quiz',
    title: 'Quiz',
    blurb: 'Four straight questions. One answer is right.',
    cover: '/events/cards/quiz.jpg',
    bank: {
      id: 'event-quiz',
      title: 'Quiz night',
      feeShannons: FEE,
      questions: [
        question('quiz', 'Signs', 'How many sides does a stop sign have?', ['8', '6', '4', '10'], 0, 'a1'.repeat(32)),
        question('quiz', 'Planets', 'Which planet is known for its bright rings?', ['Mars', 'Saturn', 'Venus', 'Mercury'], 1, 'a2'.repeat(32)),
        question('quiz', 'Water', 'What is the boiling point of water at sea level, in Celsius?', ['90', '80', '100', '212'], 2, 'a3'.repeat(32)),
        question('quiz', 'Keys', 'Which instrument has 88 keys?', ['Guitar', 'Violin', 'Flute', 'Piano'], 3, 'a4'.repeat(32)),
      ],
    },
  },
  {
    id: 'lyric',
    title: 'Lyrics',
    blurb: 'An original line with a blank. Pick the missing word.',
    cover: '/events/cards/lyric.jpg',
    bank: {
      id: 'event-lyric',
      title: 'Lyric night',
      feeShannons: FEE,
      questions: [
        question('lyric', 'Light', 'We kept the light on ______ the street went quiet', ['till', 'under', 'selling', 'counting'], 0, 'b1'.repeat(32)),
        question('lyric', 'Drum', 'If the drum is loud, the answer is ______', ['softer', 'closer', 'later', 'cheaper'], 1, 'b2'.repeat(32)),
        question('lyric', 'Crown', 'Pass the crown and leave the ______ in the pot', ['name', 'door', 'fee', 'map'], 2, 'b3'.repeat(32)),
        question('lyric', 'Room', 'The room sings back when the ______ comes around', ['host', 'clock', 'receipt', 'chorus'], 3, 'b4'.repeat(32)),
      ],
    },
  },
  {
    id: 'place',
    title: 'Where is this',
    blurb: 'A picture of a place. Four names, one of them true.',
    cover: '/events/places/marrakech.jpg',
    bank: {
      id: 'event-place',
      title: 'Where is this',
      feeShannons: FEE,
      questions: [
        {
          ...question('place', 'Coast', 'Where is this?', ['Lagos', 'Accra', 'Dakar', 'Douala'], 0, 'c1'.repeat(32)),
          image: '/events/places/lagos.jpg',
        },
        {
          ...question('place', 'Gate', 'Where is this?', ['Nara', 'Miyajima', 'Seoul', 'Taipei'], 1, 'c2'.repeat(32)),
          image: '/events/places/miyajima.jpg',
        },
        {
          ...question('place', 'Court', 'Where is this?', ['Fez', 'Tunis', 'Marrakech', 'Cairo'], 2, 'c3'.repeat(32)),
          image: '/events/places/marrakech.jpg',
        },
        {
          ...question('place', 'Hill', 'Where is this?', ['Lisbon', 'Havana', 'Cape Town', 'Valparaíso'], 3, 'c4'.repeat(32)),
          image: '/events/places/valparaiso.jpg',
        },
      ],
    },
  },
  {
    id: 'translate',
    title: 'Translate',
    blurb: 'A short line. Pick the meaning.',
    cover: '/events/cards/translate.jpg',
    bank: {
      id: 'event-translate',
      title: 'Translate',
      feeShannons: FEE,
      questions: [
        question('translate', 'French', 'What does “Il pleut” mean?', ['It is raining', 'It is snowing', 'The sun is out', 'The wind stopped'], 0, 'd1'.repeat(32)),
        question('translate', 'Spanish', 'What does “Tengo hambre” mean?', ['I am thirsty', 'I am hungry', 'I am late', 'I am lost'], 1, 'd2'.repeat(32)),
        question('translate', 'Yoruba', 'What does “Bawo ni” mean?', ['Good night', 'Thank you', 'How are you', 'Come here'], 2, 'd3'.repeat(32)),
        question('translate', 'Japanese', 'What does “Arigatou” mean?', ['Excuse me', 'Good morning', 'Please', 'Thank you'], 3, 'd4'.repeat(32)),
      ],
    },
  },
  {
    id: 'chant',
    title: 'The next chant',
    blurb: 'A call from the room. Pick the line that answers it.',
    cover: '/events/cards/chant.jpg',
    bank: {
      id: 'event-chant',
      title: 'The next chant',
      feeShannons: FEE,
      questions: [
        question('chant', 'Drum', 'When the drum calls, the room says ______', ['We are here', 'Pay the fee', 'Close the door', 'Count the cells'], 0, 'e1'.repeat(32)),
        question('chant', 'Hands', 'Hands up if you came to ______', ['leave it', 'take it', 'sell it', 'hide it'], 1, 'e2'.repeat(32)),
        question('chant', 'Crown', 'One crown, one pot. The king is ______', ['the first to sit', 'the host’s cousin', 'the last one standing', 'a coin flip'], 2, 'e3'.repeat(32)),
        question('chant', 'Light', 'Say it back: keep the light, ______', ['drop the bid', 'lock the door', 'end the night', 'pass the crown'], 3, 'e4'.repeat(32)),
      ],
    },
  },
];

export function eventPreset(id: EventKind): EventPreset {
  const found = EVENT_PRESETS.find((item) => item.id === id);
  if (!found) throw new Error('Unknown event.');
  return found;
}
