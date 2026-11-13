import { expect, it } from 'vitest';
import { Contracts, type Plan } from '../src/shared/Contracts';
import { DepictedEntityRules } from '../src/domain/DepictedEntityRules';

function plan(): Plan {
  return Contracts.plan.parse({
    variants: [
      {
        title: 'Приключение',
        concept: 'Разные герои одной истории',
        cards: [
          {
            subject: 'Самородок',
            subjectType: 'gold_nugget',
            category: '1',
            role: 'Находка',
            description: 'Один крупный золотой самородок',
            depictedEntities: [
              { identity: 'gold_nugget', kind: 'object', appearance: 'Крупный угловатый золотой камень' },
            ],
          },
          {
            subject: 'Геолог изучает породу',
            subjectType: 'geologist_examining_rock',
            category: '5',
            role: 'Исследование',
            description: 'Пожилая женщина с серебристой косой изучает породу',
            depictedEntities: [
              {
                identity: 'geologist',
                kind: 'character',
                appearance: 'Пожилая худощавая женщина с серебристой косой и зелёным пальто',
              },
            ],
          },
          {
            subject: 'Встреча у станции',
            subjectType: 'station_meeting',
            category: '5',
            role: 'Знакомство',
            description: 'Молодой темноволосый мужчина и рыжая девочка знакомятся',
            depictedEntities: [
              {
                identity: 'station_agent',
                kind: 'character',
                appearance: 'Молодой высокий мужчина с тёмными волосами и красным жилетом',
              },
              {
                identity: 'traveler',
                kind: 'character',
                appearance: 'Невысокая рыжая девочка с веснушками и жёлтой курткой',
              },
            ],
          },
        ],
      },
    ],
  });
}

it('accepts distinct visible people and objects in a single set and preserves them on decoding', () => {
  const value = plan();
  expect(() => DepictedEntityRules.validate(value)).not.toThrow();
  expect(Contracts.plan.parse(value)).toEqual(value);
});

it('rejects the same hero in a solo scene and a duo with a different scene name', () => {
  const value = plan();
  const first = value.variants[0]?.cards[1]?.depictedEntities?.[0];
  const second = value.variants[0]?.cards[2]?.depictedEntities;
  if (!first || !second) throw new Error('Missing fixture actors');
  second[0] = first;
  expect(() => DepictedEntityRules.validate(value)).toThrow(
    /Duplicate depicted entity.*set 1, slot 3.*set 1, slot 2/,
  );
});

it('rejects renaming a character while retaining the same declared appearance', () => {
  const value = plan();
  const first = value.variants[0]?.cards[1]?.depictedEntities?.[0];
  const second = value.variants[0]?.cards[2]?.depictedEntities?.[0];
  if (!first || !second) throw new Error('Missing fixture actors');
  second.appearance = ` ${first.appearance.toUpperCase()} `;
  expect(() => DepictedEntityRules.validate(value)).toThrow('Duplicate character appearance');
});

it('rejects an ordinary subject reused as an interaction prop in a gold scene', () => {
  const value = plan();
  const first = value.variants[0]?.cards[0]?.depictedEntities?.[0];
  const second = value.variants[0]?.cards[1]?.depictedEntities;
  if (!first || !second) throw new Error('Missing fixture entities');
  second.push(first);
  expect(() => DepictedEntityRules.validate(value)).toThrow(/Duplicate depicted entity.*object\/gold_nugget/);
});

it('rejects cross-set repeats and missing inventories while historical plans remain readable', () => {
  const value = plan();
  const variant = value.variants[0];
  if (!variant) throw new Error('Missing fixture set');
  value.variants.push(structuredClone(variant));
  expect(() => DepictedEntityRules.validate(value)).toThrow(/set 2, slot 1/);
  for (const entry of value.variants) for (const card of entry.cards) delete card.depictedEntities;
  expect(() => Contracts.plan.parse(value)).not.toThrow();
  expect(() => DepictedEntityRules.validate(value)).toThrow('Missing depicted identities');
});
