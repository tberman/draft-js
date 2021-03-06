/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

import type {BlockMap} from 'BlockMap';
import type ContentState from 'ContentState';
import type SelectionState from 'SelectionState';

const ContentBlockNode = require('ContentBlockNode');
const Immutable = require('immutable');

const generateRandomKey = require('generateRandomKey');
const invariant = require('invariant');

const {List, Map} = Immutable;

const transformBlock = (
  key: ?string,
  blockMap: BlockMap,
  func: (block: ContentBlockNode) => ContentBlockNode,
): void => {
  if (!key) {
    return;
  }

  const block = blockMap.get(key);

  if (!block) {
    return;
  }

  blockMap.set(key, func(block));
};

const updateBlockMapLinks = (
  blockMap: BlockMap,
  originalBlock: ContentBlockNode,
  belowBlock: ContentBlockNode,
): BlockMap => {
  return blockMap.withMutations(blocks => {
    const originalBlockKey = originalBlock.getKey();
    const belowBlockKey = belowBlock.getKey();

    // update block parent
    transformBlock(originalBlock.getParentKey(), blocks, block => {
      const parentChildrenList = block.getChildKeys();
      const insertionIndex = parentChildrenList.indexOf(originalBlockKey) + 1;
      const newChildrenArray = parentChildrenList.toArray();

      newChildrenArray.splice(insertionIndex, 0, belowBlockKey);

      return block.merge({
        children: List(newChildrenArray),
      });
    });

    // update original next block
    transformBlock(originalBlock.getNextSiblingKey(), blocks, block =>
      block.merge({
        prevSibling: belowBlockKey,
      }),
    );

    // update original block
    transformBlock(originalBlockKey, blocks, block =>
      block.merge({
        nextSibling: belowBlockKey,
      }),
    );

    // update below block
    transformBlock(belowBlockKey, blocks, block =>
      block.merge({
        prevSibling: originalBlockKey,
      }),
    );
  });
};

const blockTypesToClean = [
  'header-one',
  'header-two',
  'header-three',
  'header-four',
  'header-five',
  'header-six',
  'code-block',
];

const splitBlockInContentState = (
  contentState: ContentState,
  selectionState: SelectionState,
): ContentState => {
  invariant(selectionState.isCollapsed(), 'Selection range must be collapsed.');

  const key = selectionState.getAnchorKey();
  const offset = selectionState.getAnchorOffset();
  const blockMap = contentState.getBlockMap();
  const blockToSplit = blockMap.get(key);
  const text = blockToSplit.getText();
  const chars = blockToSplit.getCharacterList();
  const keyBelow = generateRandomKey();
  const isExperimentalTreeBlock = blockToSplit instanceof ContentBlockNode;

  let blockAboveType = blockToSplit.getType();
  let blockBelowType = blockToSplit.getType();

  if (blockTypesToClean.includes(blockToSplit.getType())) {
    if (offset === 0) {
      blockAboveType = 'unstyled';
    } else {
      blockBelowType = 'unstyled';
    }
  }

  const blockAbove = blockToSplit.merge({
    type: blockAboveType,
    text: text.slice(0, offset),
    characterList: chars.slice(0, offset),
  });

  const blockBelow = blockAbove.merge({
    key: keyBelow,
    type: blockBelowType,
    text: text.slice(offset),
    characterList: chars.slice(offset),
    data: Map(),
  });

  const blocksBefore = blockMap.toSeq().takeUntil(v => v === blockToSplit);
  const blocksAfter = blockMap
    .toSeq()
    .skipUntil(v => v === blockToSplit)
    .rest();
  let newBlocks = blocksBefore
    .concat([[key, blockAbove], [keyBelow, blockBelow]], blocksAfter)
    .toOrderedMap();

  if (isExperimentalTreeBlock) {
    invariant(
      blockToSplit.getChildKeys().isEmpty(),
      'ContentBlockNode must not have children',
    );

    newBlocks = updateBlockMapLinks(newBlocks, blockAbove, blockBelow);
  }

  return contentState.merge({
    blockMap: newBlocks,
    selectionBefore: selectionState,
    selectionAfter: selectionState.merge({
      anchorKey: keyBelow,
      anchorOffset: 0,
      focusKey: keyBelow,
      focusOffset: 0,
      isBackward: false,
    }),
  });
};

module.exports = splitBlockInContentState;
