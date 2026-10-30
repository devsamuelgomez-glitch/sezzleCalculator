package calc_test

import (
	"errors"
	"math"
	"testing"

	"github.com/sam/sezzle-calculator/backend/internal/calc"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		name     string
		op       calc.Operation
		operands []float64
		want     float64
		wantErr  error
	}{
		// add
		{name: "add: positive numbers", op: calc.Add, operands: []float64{2, 3}, want: 5},
		{name: "add: negative numbers", op: calc.Add, operands: []float64{-2, -3}, want: -5},
		{name: "add: mixed signs", op: calc.Add, operands: []float64{-2, 3}, want: 1},
		{name: "add: zeros", op: calc.Add, operands: []float64{0, 0}, want: 0},
		// Documented limitation (DESIGN.md, numeric strategy): the backend returns the
		// raw float64 and the frontend rounds for display.
		{name: "add: 0.1 + 0.2 is the raw float64, not 0.3", op: calc.Add, operands: []float64{0.1, 0.2}, want: 0.30000000000000004},
		{name: "add: overflow is non-finite", op: calc.Add, operands: []float64{math.MaxFloat64, math.MaxFloat64}, wantErr: calc.ErrNonFiniteResult},

		// subtract
		{name: "subtract: positive numbers", op: calc.Subtract, operands: []float64{5, 3}, want: 2},
		{name: "subtract: result goes negative", op: calc.Subtract, operands: []float64{3, 5}, want: -2},
		{name: "subtract: negative operands", op: calc.Subtract, operands: []float64{-5, -3}, want: -2},
		{name: "subtract: zero minus zero", op: calc.Subtract, operands: []float64{0, 0}, want: 0},
		{name: "subtract: overflow is non-finite", op: calc.Subtract, operands: []float64{-math.MaxFloat64, math.MaxFloat64}, wantErr: calc.ErrNonFiniteResult},

		// multiply
		{name: "multiply: positive numbers", op: calc.Multiply, operands: []float64{4, 3}, want: 12},
		{name: "multiply: one negative", op: calc.Multiply, operands: []float64{-4, 3}, want: -12},
		{name: "multiply: two negatives", op: calc.Multiply, operands: []float64{-4, -3}, want: 12},
		{name: "multiply: by zero", op: calc.Multiply, operands: []float64{5, 0}, want: 0},
		{name: "multiply: fractions", op: calc.Multiply, operands: []float64{0.5, 0.5}, want: 0.25},
		{name: "multiply: 1e308 * 10 overflows", op: calc.Multiply, operands: []float64{1e308, 10}, wantErr: calc.ErrNonFiniteResult},

		// divide
		{name: "divide: exact", op: calc.Divide, operands: []float64{10, 2}, want: 5},
		{name: "divide: fractional result", op: calc.Divide, operands: []float64{10, 4}, want: 2.5},
		{name: "divide: negative dividend", op: calc.Divide, operands: []float64{-10, 4}, want: -2.5},
		{name: "divide: zero dividend", op: calc.Divide, operands: []float64{0, 5}, want: 0},
		{name: "divide: repeating decimal", op: calc.Divide, operands: []float64{1, 3}, want: 0.3333333333333333},
		{name: "divide: by zero", op: calc.Divide, operands: []float64{1, 0}, wantErr: calc.ErrDivisionByZero},
		{name: "divide: by negative zero", op: calc.Divide, operands: []float64{1, math.Copysign(0, -1)}, wantErr: calc.ErrDivisionByZero},
		{name: "divide: zero by zero", op: calc.Divide, operands: []float64{0, 0}, wantErr: calc.ErrDivisionByZero},
		{name: "divide: overflow is non-finite", op: calc.Divide, operands: []float64{math.MaxFloat64, 0.5}, wantErr: calc.ErrNonFiniteResult},

		// power
		{name: "power: positive integer exponent", op: calc.Power, operands: []float64{2, 10}, want: 1024},
		{name: "power: negative base, odd exponent", op: calc.Power, operands: []float64{-2, 3}, want: -8},
		{name: "power: negative base, even exponent", op: calc.Power, operands: []float64{-2, 2}, want: 4},
		{name: "power: negative exponent", op: calc.Power, operands: []float64{2, -2}, want: 0.25},
		{name: "power: fractional exponent", op: calc.Power, operands: []float64{4, 0.5}, want: 2},
		{name: "power: zero exponent", op: calc.Power, operands: []float64{5, 0}, want: 1},
		{name: "power: 0^0 is 1", op: calc.Power, operands: []float64{0, 0}, want: 1},
		{name: "power: 0^positive is 0", op: calc.Power, operands: []float64{0, 3}, want: 0},
		{name: "power: 0^-1 is non-finite", op: calc.Power, operands: []float64{0, -1}, wantErr: calc.ErrNonFiniteResult},
		{name: "power: (-8)^0.5 is non-finite", op: calc.Power, operands: []float64{-8, 0.5}, wantErr: calc.ErrNonFiniteResult},
		{name: "power: 10^400 overflows", op: calc.Power, operands: []float64{10, 400}, wantErr: calc.ErrNonFiniteResult},

		// sqrt
		{name: "sqrt: perfect square", op: calc.Sqrt, operands: []float64{144}, want: 12},
		{name: "sqrt: irrational result", op: calc.Sqrt, operands: []float64{2}, want: math.Sqrt2},
		{name: "sqrt: fraction", op: calc.Sqrt, operands: []float64{0.25}, want: 0.5},
		{name: "sqrt: zero", op: calc.Sqrt, operands: []float64{0}, want: 0},
		{name: "sqrt: negative operand", op: calc.Sqrt, operands: []float64{-1}, wantErr: calc.ErrNegativeSqrt},

		// percentage: percentage(a, b) is a percent of b
		{name: "percentage: 15% of 200", op: calc.Percentage, operands: []float64{15, 200}, want: 30},
		{name: "percentage: 100% of b is b", op: calc.Percentage, operands: []float64{100, 42}, want: 42},
		{name: "percentage: 200% of 50", op: calc.Percentage, operands: []float64{200, 50}, want: 100},
		{name: "percentage: 0% of b is 0", op: calc.Percentage, operands: []float64{0, 200}, want: 0},
		{name: "percentage: of zero", op: calc.Percentage, operands: []float64{15, 0}, want: 0},
		{name: "percentage: negative base", op: calc.Percentage, operands: []float64{50, -10}, want: -5},
		{name: "percentage: fractional percent", op: calc.Percentage, operands: []float64{0.5, 200}, want: 1},

		// operand count
		{name: "count: binary op with no operands", op: calc.Add, operands: nil, wantErr: calc.ErrInvalidOperandCount},
		{name: "count: binary op with one operand", op: calc.Add, operands: []float64{1}, wantErr: calc.ErrInvalidOperandCount},
		{name: "count: binary op with three operands", op: calc.Multiply, operands: []float64{1, 2, 3}, wantErr: calc.ErrInvalidOperandCount},
		{name: "count: sqrt with no operands", op: calc.Sqrt, operands: nil, wantErr: calc.ErrInvalidOperandCount},
		{name: "count: sqrt with two operands", op: calc.Sqrt, operands: []float64{4, 2}, wantErr: calc.ErrInvalidOperandCount},

		// unknown operation
		{name: "unknown: modulo", op: "modulo", operands: []float64{1, 2}, wantErr: calc.ErrUnknownOperation},
		{name: "unknown: empty operation", op: "", operands: []float64{1, 2}, wantErr: calc.ErrUnknownOperation},
		{name: "unknown: names are case-sensitive", op: "ADD", operands: []float64{1, 2}, wantErr: calc.ErrUnknownOperation},
		{name: "unknown: reported before operand count", op: "modulo", operands: nil, wantErr: calc.ErrUnknownOperation},

		// non-finite operands never produce a finite-looking answer
		{name: "non-finite: NaN operand", op: calc.Add, operands: []float64{math.NaN(), 1}, wantErr: calc.ErrNonFiniteResult},
		{name: "non-finite: Inf operand", op: calc.Multiply, operands: []float64{math.Inf(1), 2}, wantErr: calc.ErrNonFiniteResult},
		{name: "non-finite: sqrt of +Inf", op: calc.Sqrt, operands: []float64{math.Inf(1)}, wantErr: calc.ErrNonFiniteResult},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calc.Calculate(tt.op, tt.operands...)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("Calculate(%q, %v) error = %v, want errors.Is %v", tt.op, tt.operands, err, tt.wantErr)
				}
				if got != 0 {
					t.Errorf("Calculate(%q, %v) = %v alongside an error, want 0", tt.op, tt.operands, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Calculate(%q, %v) unexpected error: %v", tt.op, tt.operands, err)
			}
			if got != tt.want {
				t.Errorf("Calculate(%q, %v) = %v, want %v", tt.op, tt.operands, got, tt.want)
			}
		})
	}
}

// 0.1 + 0.2 is the documented float64 limitation: it must not equal 0.3.
func TestCalculate_FloatingPointIsNotHidden(t *testing.T) {
	got, err := calc.Calculate(calc.Add, 0.1, 0.2)
	if err != nil {
		t.Fatal(err)
	}
	if got == 0.3 {
		t.Errorf("0.1 + 0.2 = %v; the backend must return the raw float64 (0.30000000000000004)", got)
	}
}

// A calculator must never show "-0".
func TestCalculate_NeverReturnsNegativeZero(t *testing.T) {
	negZero := math.Copysign(0, -1)
	tests := []struct {
		name     string
		op       calc.Operation
		operands []float64
	}{
		{"multiply -5 * 0", calc.Multiply, []float64{-5, 0}},
		{"divide 0 / -5", calc.Divide, []float64{0, -5}},
		{"sqrt -0", calc.Sqrt, []float64{negZero}},
		{"percentage 0% of -5", calc.Percentage, []float64{0, -5}},
		{"add -0 + -0", calc.Add, []float64{negZero, negZero}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calc.Calculate(tt.op, tt.operands...)
			if err != nil {
				t.Fatal(err)
			}
			if got != 0 || math.Signbit(got) {
				t.Errorf("Calculate(%q, %v) = %v (signbit %t), want +0", tt.op, tt.operands, got, math.Signbit(got))
			}
		})
	}
}

func TestCalculate_ErrorsAreDistinct(t *testing.T) {
	sentinels := []error{
		calc.ErrDivisionByZero,
		calc.ErrNegativeSqrt,
		calc.ErrInvalidOperandCount,
		calc.ErrUnknownOperation,
		calc.ErrNonFiniteResult,
	}
	for i, a := range sentinels {
		for j, b := range sentinels {
			if i != j && errors.Is(a, b) {
				t.Errorf("errors.Is(%v, %v) = true, want sentinels to be distinct", a, b)
			}
		}
	}
}

func TestCalculate_OperandCountErrorDetails(t *testing.T) {
	_, err := calc.Calculate(calc.Sqrt, 4, 2)

	var countErr *calc.OperandCountError
	if !errors.As(err, &countErr) {
		t.Fatalf("error %v is not a *calc.OperandCountError", err)
	}
	if countErr.Op != calc.Sqrt || countErr.Want != 1 || countErr.Got != 2 {
		t.Errorf("got {Op:%q Want:%d Got:%d}, want {Op:%q Want:1 Got:2}", countErr.Op, countErr.Want, countErr.Got, calc.Sqrt)
	}
	if !errors.Is(err, calc.ErrInvalidOperandCount) {
		t.Errorf("errors.Is(%v, ErrInvalidOperandCount) = false", err)
	}
	if err.Error() == "" {
		t.Error("error message is empty")
	}
}

func TestCalculate_ErrorMessagesNameTheOffendingInput(t *testing.T) {
	_, err := calc.Calculate("modulo", 1, 2)
	if err == nil || !errors.Is(err, calc.ErrUnknownOperation) {
		t.Fatalf("got %v, want ErrUnknownOperation", err)
	}
	if got, want := err.Error(), `unknown operation "modulo"`; got != want {
		t.Errorf("message = %q, want %q", got, want)
	}
}

func TestOperation_Arity(t *testing.T) {
	tests := []struct {
		op   calc.Operation
		want int
	}{
		{calc.Add, 2},
		{calc.Subtract, 2},
		{calc.Multiply, 2},
		{calc.Divide, 2},
		{calc.Power, 2},
		{calc.Percentage, 2},
		{calc.Sqrt, 1},
		{"modulo", 0},
		{"", 0},
	}
	for _, tt := range tests {
		t.Run(string(tt.op), func(t *testing.T) {
			if got := tt.op.Arity(); got != tt.want {
				t.Errorf("Operation(%q).Arity() = %d, want %d", tt.op, got, tt.want)
			}
		})
	}
}
