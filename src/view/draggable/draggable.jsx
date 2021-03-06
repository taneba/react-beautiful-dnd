// @flow
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import memoizeOne from 'memoize-one';
import invariant from 'invariant';
import type {
  Position,
  HTMLElement,
  DraggableDimension,
  InitialDragLocation,
} from '../../types';
import DraggableDimensionPublisher from '../draggable-dimension-publisher/';
import Moveable from '../moveable/';
import DragHandle from '../drag-handle';
import { css } from '../animation';
import getWindowScrollPosition from '../get-window-scroll-position';
// eslint-disable-next-line no-duplicate-imports
import type {
  Callbacks as DragHandleCallbacks,
  Provided as DragHandleProvided,
} from '../drag-handle/drag-handle-types';
import getCenterPosition from '../get-center-position';
import Placeholder from './placeholder';
import { droppableIdKey } from '../context-keys';
import { add } from '../../state/position';
import type {
  Props,
  Provided,
  StateSnapshot,
  DefaultProps,
  DraggingStyle,
  NotDraggingStyle,
  DraggableStyle,
  ZIndexOptions,
} from './draggable-types';
import type { Speed, Style as MovementStyle } from '../moveable/moveable-types';

type State = {|
  ref: ?HTMLElement,
|}

export const zIndexOptions: ZIndexOptions = {
  dragging: 5000,
  dropAnimating: 4500,
};

export default class Draggable extends Component {
  /* eslint-disable react/sort-comp */
  props: Props
  state: State
  callbacks: DragHandleCallbacks

  state: State = {
    ref: null,
  }

  static defaultProps: DefaultProps = {
    isDragDisabled: false,
    type: 'DEFAULT',
  }

  // Need to declare contextTypes without flow
  // https://github.com/brigand/babel-plugin-flow-react-proptypes/issues/22
  static contextTypes = {
    [droppableIdKey]: PropTypes.string.isRequired,
  }
  /* eslint-enable */

  constructor(props: Props, context: mixed) {
    super(props, context);

    this.callbacks = {
      onLift: this.onLift,
      onMove: this.onMove,
      onDrop: this.onDrop,
      onCancel: this.onCancel,
      onKeyLift: this.onKeyLift,
      onMoveBackward: this.onMoveBackward,
      onMoveForward: this.onMoveForward,
      onWindowScroll: this.onWindowScroll,
    };
  }

  // This should already be handled gracefully in DragHandle.
  // Just being extra clear here
  throwIfCannotDrag() {
    invariant(this.state.ref,
      'Draggable: cannot drag as no DOM node has been provided'
    );
    invariant(!this.props.isDragDisabled,
      'Draggable: cannot drag as dragging is not enabled'
    );
  }

  onMoveEnd = () => {
    if (!this.props.isDropAnimating) {
      return;
    }

    this.props.dropAnimationFinished(this.props.draggableId);
  }

  onLift = (point: Position) => {
    this.throwIfCannotDrag();
    const { lift, draggableId, type } = this.props;
    const { ref } = this.state;

    const windowScroll: Position = getWindowScrollPosition();

    const client: InitialDragLocation = {
      selection: point,
      center: getCenterPosition(ref),
    };

    const page: InitialDragLocation = {
      selection: add(client.selection, windowScroll),
      center: add(client.center, windowScroll),
    };

    lift(draggableId, type, client, page, windowScroll);
  }

  onKeyLift = () => {
    this.throwIfCannotDrag();
    const { lift, draggableId, type } = this.props;
    const { ref } = this.state;

    // using center position as selection
    const center: Position = getCenterPosition(ref);

    const client: InitialDragLocation = {
      selection: center,
      center,
    };

    const windowScroll: Position = getWindowScrollPosition();
    const page: InitialDragLocation = {
      selection: add(center, windowScroll),
      center: add(center, windowScroll),
    };

    lift(draggableId, type, client, page, windowScroll);
  }

  onMove = (client: Position) => {
    this.throwIfCannotDrag();

    const { draggableId, dimension, move } = this.props;

    // dimensions not provided yet
    if (!dimension) {
      return;
    }

    const windowScroll: Position = getWindowScrollPosition();
    const page: Position = add(client, windowScroll);

    move(draggableId, client, page, windowScroll);
  }

  onMoveForward = () => {
    this.throwIfCannotDrag();
    this.props.moveForward(this.props.draggableId);
  }

  onMoveBackward = () => {
    this.throwIfCannotDrag();
    this.props.moveBackward(this.props.draggableId);
  }

  onWindowScroll = () => {
    this.throwIfCannotDrag();
    const windowScroll = getWindowScrollPosition();
    this.props.moveByWindowScroll(this.props.draggableId, windowScroll);
  }

  onDrop = () => {
    this.throwIfCannotDrag();
    this.props.drop();
  }

  onCancel = () => {
    // Not checking if drag is enabled.
    // Cancel is an escape mechanism
    this.props.cancel();
  }

  // React calls ref callback twice for every render
  // https://github.com/facebook/react/pull/8333/files
  setRef = ((ref: ?HTMLElement) => {
    // TODO: need to clear this.state.ref on unmount
    if (ref === null) {
      return;
    }

    if (ref === this.state.ref) {
      return;
    }

    // need to trigger a child render when ref changes
    this.setState({
      ref,
    });
  })

  getPlaceholder() {
    const dimension: ?DraggableDimension = this.props.dimension;
    invariant(dimension, 'cannot get a drag placeholder when not dragging');

    return (
      <Placeholder
        height={dimension.page.withMargin.height}
        width={dimension.page.withMargin.width}
      />
    );
  }

  getDraggingStyle = memoizeOne(
    (width: number,
      height: number,
      top: number,
      left: number,
      isDropAnimating: boolean,
      movementStyle: MovementStyle): DraggingStyle => {
      // For an explanation of properties see `draggable-types`.
      const style: DraggingStyle = {
        position: 'fixed',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: isDropAnimating ? zIndexOptions.dropAnimating : zIndexOptions.dragging,
        width,
        height,
        top,
        left,
        margin: 0,
        transform: movementStyle.transform ? `${movementStyle.transform}` : null,
      };
      return style;
    }
  )

  getNotDraggingStyle = memoizeOne(
    (
      canAnimate: boolean,
      movementStyle: MovementStyle,
      canLift: boolean,
    ): NotDraggingStyle => {
      const style: NotDraggingStyle = {
        transition: canAnimate ? css.outOfTheWay : null,
        transform: movementStyle.transform,
        pointerEvents: canLift ? 'auto' : 'none',
      };
      return style;
    }
  )

  getProvided = memoizeOne(
    (
      isDragging: boolean,
      isDropAnimating: boolean,
      canLift: boolean,
      canAnimate: boolean,
      dimension: ?DraggableDimension,
      dragHandleProps: ?DragHandleProvided,
      movementStyle: MovementStyle,
    ): Provided => {
      const useDraggingStyle: boolean = isDragging || isDropAnimating;

      const draggableStyle: DraggableStyle = (() => {
        if (!useDraggingStyle) {
          return this.getNotDraggingStyle(
            canAnimate,
            movementStyle,
            canLift,
          );
        }
        invariant(dimension, 'draggable dimension required for dragging');

        // Margins are accounted for. See `draggable-types` for explanation
        const { width, height, top, left } = dimension.client.withoutMargin;

        return this.getDraggingStyle(width, height, top, left, isDropAnimating, movementStyle);
      })();

      const provided: Provided = {
        innerRef: this.setRef,
        placeholder: useDraggingStyle ? this.getPlaceholder() : null,
        dragHandleProps,
        draggableStyle,
      };
      return provided;
    }
  )

  getSnapshot = memoizeOne((isDragging: boolean, isDropAnimating: boolean): StateSnapshot => ({
    isDragging: (isDragging || isDropAnimating),
  }))

  getSpeed = memoizeOne(
    (isDragging: boolean, isDropAnimating: boolean, canAnimate: boolean): Speed => {
      if (!canAnimate) {
        return 'INSTANT';
      }

      if (isDropAnimating) {
        return 'STANDARD';
      }

      // if dragging and can animate - then move quickly
      if (isDragging) {
        return 'FAST';
      }

      // Moving out of the way.
      // Animation taken care of by css
      return 'INSTANT';
    })

  render() {
    const {
      draggableId,
      type,
      offset,
      isDragging,
      isDropAnimating,
      canLift,
      canAnimate,
      isDragDisabled,
      dimension,
      children,
    } = this.props;

    const speed = this.getSpeed(isDragging, isDropAnimating, canAnimate);

    return (
      <DraggableDimensionPublisher
        draggableId={draggableId}
        droppableId={this.context[droppableIdKey]}
        type={type}
        targetRef={this.state.ref}
      >
        <Moveable
          speed={speed}
          destination={offset}
          onMoveEnd={this.onMoveEnd}
        >
          {(movementStyle: MovementStyle) => (
            <DragHandle
              isDragging={isDragging}
              isEnabled={!isDragDisabled}
              canLift={canLift}
              callbacks={this.callbacks}
              draggableRef={this.state.ref}
            >
              {(dragHandleProps: ?DragHandleProvided) =>
                children(
                  this.getProvided(
                    isDragging,
                    isDropAnimating,
                    canLift,
                    canAnimate,
                    dimension,
                    dragHandleProps,
                    movementStyle,
                  ),
                  this.getSnapshot(isDragging, isDropAnimating)
                )
              }
            </DragHandle>
        )}
        </Moveable>
      </DraggableDimensionPublisher>
    );
  }
}
