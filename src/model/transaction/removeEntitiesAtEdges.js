/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule removeEntitiesAtEdges
 * @format
 * @flow
 */

'use strict';

import type {BlockNodeRecord} from 'BlockNodeRecord';
import type ContentState from 'ContentState';
import type {EntityMap} from 'EntityMap';
import type SelectionState from 'SelectionState';
import type {List} from 'immutable';

var CharacterMetadata = require('CharacterMetadata');

var findRangesImmutable = require('findRangesImmutable');
var invariant = require('invariant');

function removeEntitiesAtEdges(
  contentState: ContentState,
  selectionState: SelectionState,
): ContentState {
  var blockMap = contentState.getBlockMap();
  var entityMap = contentState.getEntityMap();

  var updatedBlocks = {};

  var startKey = selectionState.getStartKey();
  var startOffset = selectionState.getStartOffset();
  var startBlock = blockMap.get(startKey);
  var updatedStart = removeForBlock(entityMap, startBlock, startOffset);

  if (updatedStart !== startBlock) {
    updatedBlocks[startKey] = updatedStart;
  }

  var endKey = selectionState.getEndKey();
  var endOffset = selectionState.getEndOffset();
  var endBlock = blockMap.get(endKey);
  if (startKey === endKey) {
    endBlock = updatedStart;
  }

  var updatedEnd = removeForBlock(entityMap, endBlock, endOffset);

  if (updatedEnd !== endBlock) {
    updatedBlocks[endKey] = updatedEnd;
  }

  if (!Object.keys(updatedBlocks).length) {
    return contentState.set('selectionAfter', selectionState);
  }

  return contentState.merge({
    blockMap: blockMap.merge(updatedBlocks),
    selectionAfter: selectionState,
  });
}

function getRemovalRange(
  characters: List<CharacterMetadata>,
  key: string,
  offset: number,
): Object {
  var removalRange;
  findRangesImmutable(
    characters,
    (a, b) => a.getEntity().intersect(b.getEntity()).size > 0,
    element => element.getEntity().has(key),
    (start, end) => {
      if (start <= offset && end >= offset) {
        removalRange = {start, end};
      }
    },
  );
  invariant(
    typeof removalRange === 'object',
    'Removal range must exist within character list.',
  );
  return removalRange;
}

function removeForBlock(
  entityMap: EntityMap,
  block: BlockNodeRecord,
  offset: number,
): BlockNodeRecord {
  var chars = block.getCharacterList();
  var charBefore = offset > 0 ? chars.get(offset - 1) : undefined;
  var charAfter = offset < chars.count() ? chars.get(offset) : undefined;
  var entityBeforeCursor = charBefore ? charBefore.getEntity() : undefined;
  var entityAfterCursor = charAfter ? charAfter.getEntity() : undefined;

  if (entityAfterCursor) {
    entityAfterCursor.forEach(entityKey => {
      if (entityBeforeCursor && entityBeforeCursor.has(entityKey)) {
        var entity = entityMap.get(entityKey);
        if (
          !(
            entity.getMutability() === 'MUTABLE' ||
            entity.getMutability() === 'MUTABLE_INTERIOR'
          )
        ) {
          var {start, end} = getRemovalRange(chars, entityKey, offset);
          var current;
          while (start < end) {
            current = chars.get(start);
            chars = chars.set(
              start,
              CharacterMetadata.removeEntity(current, entityKey),
            );
            start++;
          }
          block = block.set('characterList', chars);
        }
      }
    });
  }

  return block;
}

module.exports = removeEntitiesAtEdges;
