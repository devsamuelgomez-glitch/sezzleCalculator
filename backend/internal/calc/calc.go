// Package calc is the pure arithmetic domain of the calculator. It knows
// nothing about HTTP or JSON; the api package translates between those and
// this package.
//
// All arithmetic is float64 (see "Numeric strategy" in docs/DESIGN.md), so
// results are the raw IEEE 754 values: 0.1 + 0.2 is 0.30000000000000004.
// Rounding for display is the frontend's job.
package calc

import (
	"errors"
	"fmt"
	"math"
)

// Operation names an arithmetic operation. The values are the wire names used
// by the API.
type Operation string

const (
	Add        Operation = "add"
	Subtract   Operation = "subtract"
	Multiply   Operation = "multiply"
	Divide     Operation = "divide"
	Power      Operation = "power"
	Sqrt       Operation = "sqrt"
	Percentage Operation = "percentage" // percentage(a, b) is a percent of b
)

// Sentinel errors. Calculate wraps them with context, so match with
// errors.Is rather than ==.
var (
	ErrDivisionByZero      = errors.New("cannot divide by zero")
	ErrNegativeSqrt        = errors.New("cannot take the square root of a negative number")
	ErrInvalidOperandCount = errors.New("invalid operand count")
	ErrUnknownOperation    = errors.New("unknown operation")
	ErrNonFiniteResult     = errors.New("result is not a finite number")
)

// OperandCountError reports how many operands an operation needed and how many
// it received. It matches ErrInvalidOperandCount under errors.Is.
type OperandCountError struct {
	Op        Operation
	Want, Got int
}

func (e *OperandCountError) Error() string {
	return fmt.Sprintf("%s takes %d operand(s), got %d", e.Op, e.Want, e.Got)
}

func (e *OperandCountError) Is(target error) bool { return target == ErrInvalidOperandCount }

// Arity returns the number of operands the operation takes, or 0 if the
// operation is unknown.
func (o Operation) Arity() int {
	switch o {
	case Add, Subtract, Multiply, Divide, Power, Percentage:
		return 2
	case Sqrt:
		return 1
	default:
		return 0
	}
}

// Calculate applies op to operands.
//
// The variadic signature keeps one entry point for unary and binary
// operations and makes arity violations a domain error (ErrInvalidOperandCount)
// instead of a caller-side convention. The api package can still check arity
// first to report which operand is missing.
//
// On error the returned value is 0. A result that is NaN or ±Inf (overflow,
// 0^-1, (-8)^0.5, or a non-finite operand) yields ErrNonFiniteResult. A
// negative zero result is returned as +0 so the UI never shows "-0".
func Calculate(op Operation, operands ...float64) (float64, error) {
	want := op.Arity()
	if want == 0 {
		return 0, fmt.Errorf("%w %q", ErrUnknownOperation, string(op))
	}
	if len(operands) != want {
		return 0, &OperandCountError{Op: op, Want: want, Got: len(operands)}
	}

	var result float64
	switch op {
	case Add:
		result = operands[0] + operands[1]
	case Subtract:
		result = operands[0] - operands[1]
	case Multiply:
		result = operands[0] * operands[1]
	case Divide:
		if operands[1] == 0 {
			return 0, ErrDivisionByZero
		}
		result = operands[0] / operands[1]
	case Power:
		result = math.Pow(operands[0], operands[1])
	case Sqrt:
		if operands[0] < 0 {
			return 0, ErrNegativeSqrt
		}
		result = math.Sqrt(operands[0])
	case Percentage:
		result = operands[0] / 100 * operands[1]
	}

	if math.IsNaN(result) || math.IsInf(result, 0) {
		return 0, ErrNonFiniteResult
	}
	return result + 0, nil // adding +0 turns -0 into +0
}
