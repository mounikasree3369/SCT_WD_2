/**
 * AetherCalc - Safe Mathematical Expression Parser
 * Implements a full Lexer, Shunting-Yard Parser (Infix to RPN), and RPN Evaluator.
 * Avoids any use of eval() or Function() constructor for ultimate safety and performance.
 */

const MathParser = (() => {
  
  // Precedence values
  const PRECEDENCE = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    '%': 2,
    '^': 3,
    'u-': 4 // Unary minus
  };

  // Associativity: Left (L) or Right (R)
  const ASSOCIATIVITY = {
    '+': 'L',
    '-': 'L',
    '*': 'L',
    '/': 'L',
    '%': 'L',
    '^': 'R',
    'u-': 'R'
  };

  const FUNCTIONS = ['sin', 'cos', 'tan', 'sqrt', 'log', 'ln'];
  const CONSTANTS = {
    'π': Math.PI,
    'e': Math.E
  };

  /**
   * Lexical analyzer: Converts input string into an array of semantic tokens.
   */
  function tokenize(str) {
    const tokens = [];
    let i = 0;
    
    // Normalize input formatting
    str = str.replace(/\s+/g, '') // remove spaces
             .replace(/×/g, '*')
             .replace(/÷/g, '/');

    while (i < str.length) {
      const char = str[i];

      // 1. Parentheses
      if (char === '(' || char === ')') {
        tokens.push({ type: 'PAREN', value: char });
        i++;
        continue;
      }

      // 2. Operators
      if ('+-*/%^'.includes(char)) {
        tokens.push({ type: 'OPERATOR', value: char });
        i++;
        continue;
      }

      // 3. Numbers (including floats)
      if (/[0-9.]/.test(char)) {
        let numStr = '';
        let hasDot = false;
        
        while (i < str.length && /[0-9.]/.test(str[i])) {
          if (str[i] === '.') {
            if (hasDot) throw new Error('Syntax Error: Multiple decimal points in a single number');
            hasDot = true;
          }
          numStr += str[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // 4. Constants (π)
      if (char === 'π') {
        tokens.push({ type: 'CONSTANT', value: 'π' });
        i++;
        continue;
      }

      // 5. Letter-based constants (e) or Functions (sin, cos, tan, sqrt, log, ln)
      if (/[a-zA-Z]/.test(char)) {
        let word = '';
        while (i < str.length && /[a-zA-Z]/.test(str[i])) {
          word += str[i];
          i++;
        }
        
        if (word === 'e') {
          tokens.push({ type: 'CONSTANT', value: 'e' });
        } else if (FUNCTIONS.includes(word)) {
          tokens.push({ type: 'FUNCTION', value: word });
        } else {
          throw new Error(`Syntax Error: Unknown identifier "${word}"`);
        }
        continue;
      }

      // 6. Unknown Character
      throw new Error(`Syntax Error: Invalid character "${char}"`);
    }

    return tokens;
  }

  /**
   * Preprocessor to insert implicit multiplication tokens:
   * e.g., 2(3+4) -> 2*(3+4), 3π -> 3*π, (5-3)(4) -> (5-3)*(4), 2sqrt(4) -> 2*sqrt(4)
   */
  function insertImplicitMultiplication(tokens) {
    const result = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const current = tokens[i];
      result.push(current);
      
      if (i < tokens.length - 1) {
        const next = tokens[i + 1];
        
        // Trigger implicit multiplication if current token is a source of multiplier
        // and next token is a target of multiplication.
        const isCurrentMultiplier = 
          current.type === 'NUMBER' || 
          current.type === 'CONSTANT' || 
          (current.type === 'PAREN' && current.value === ')');
          
        const isNextMultiplied = 
          next.type === 'CONSTANT' || 
          next.type === 'FUNCTION' || 
          (next.type === 'PAREN' && next.value === '(');
          
        // Explicit edge cases: number directly followed by another number?
        // (Handled by lexer but constants need tracking, e.g. π followed by number)
        const isConstantAndNumber = 
          current.type === 'CONSTANT' && next.type === 'NUMBER';

        if ((isCurrentMultiplier && isNextMultiplied) || isConstantAndNumber) {
          result.push({ type: 'OPERATOR', value: '*' });
        }
      }
    }
    
    return result;
  }

  /**
   * Preprocessor to detect and label unary minus operators.
   * A '-' is unary if it is the first token, or if it immediately follows another operator or '('
   */
  function identifyUnaryOperators(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const current = tokens[i];
      
      if (current.type === 'OPERATOR' && current.value === '-') {
        const prev = tokens[i - 1];
        const isUnary = !prev || 
                        prev.type === 'OPERATOR' || 
                        (prev.type === 'PAREN' && prev.value === '(');
        
        if (isUnary) {
          current.value = 'u-'; // rename operator to distinguish precedence
        }
      }
    }
    return tokens;
  }

  /**
   * Shunting-Yard Algorithm: Translates token array (infix) into RPN (postfix).
   */
  function shuntingYard(tokens) {
    const outputQueue = [];
    const operatorStack = [];

    for (const token of tokens) {
      if (token.type === 'NUMBER' || token.type === 'CONSTANT') {
        outputQueue.push(token);
      } 
      else if (token.type === 'FUNCTION') {
        operatorStack.push(token);
      } 
      else if (token.type === 'OPERATOR') {
        let top = operatorStack[operatorStack.length - 1];
        
        while (
          top && 
          (top.type === 'OPERATOR' || top.type === 'FUNCTION') && 
          (
            top.type === 'FUNCTION' ||
            (ASSOCIATIVITY[token.value] === 'L' && PRECEDENCE[token.value] <= PRECEDENCE[top.value]) ||
            (ASSOCIATIVITY[token.value] === 'R' && PRECEDENCE[token.value] < PRECEDENCE[top.value])
          )
        ) {
          outputQueue.push(operatorStack.pop());
          top = operatorStack[operatorStack.length - 1];
        }
        operatorStack.push(token);
      } 
      else if (token.type === 'PAREN' && token.value === '(') {
        operatorStack.push(token);
      } 
      else if (token.type === 'PAREN' && token.value === ')') {
        let top = operatorStack[operatorStack.length - 1];
        let foundLeftParen = false;

        while (top) {
          if (top.type === 'PAREN' && top.value === '(') {
            foundLeftParen = true;
            break;
          }
          outputQueue.push(operatorStack.pop());
          top = operatorStack[operatorStack.length - 1];
        }

        if (!foundLeftParen) {
          throw new Error('Syntax Error: Mismatched parentheses (excessive closing bracket)');
        }
        
        operatorStack.pop(); // Remove left parenthesis from stack

        // If the top of the stack is a function, pop it onto the output queue
        const nextTop = operatorStack[operatorStack.length - 1];
        if (nextTop && nextTop.type === 'FUNCTION') {
          outputQueue.push(operatorStack.pop());
        }
      }
    }

    // Pop any remaining operators onto output queue
    while (operatorStack.length > 0) {
      const top = operatorStack.pop();
      if (top.type === 'PAREN' && (top.value === '(' || top.value === ')')) {
        throw new Error('Syntax Error: Mismatched parentheses (excessive opening bracket)');
      }
      outputQueue.push(top);
    }

    return outputQueue;
  }

  /**
   * RPN Evaluator: Processes postfix queue and returns the final numerical result.
   */
  function evaluateRPN(rpn) {
    const stack = [];

    for (const token of rpn) {
      if (token.type === 'NUMBER') {
        stack.push(token.value);
      } 
      else if (token.type === 'CONSTANT') {
        stack.push(CONSTANTS[token.value]);
      } 
      else if (token.type === 'OPERATOR') {
        if (token.value === 'u-') {
          if (stack.length < 1) throw new Error('Syntax Error: Invalid expression');
          const val = stack.pop();
          stack.push(-val);
        } else {
          if (stack.length < 2) throw new Error('Syntax Error: Missing operands for binary operator');
          const b = stack.pop();
          const a = stack.pop();
          
          let result;
          switch (token.value) {
            case '+': result = a + b; break;
            case '-': result = a - b; break;
            case '*': result = a * b; break;
            case '/': 
              if (b === 0) throw new Error('Cannot divide by zero');
              result = a / b; 
              break;
            case '%': 
              if (b === 0) throw new Error('Cannot divide by zero (modulo)');
              result = a % b; 
              break;
            case '^': result = Math.pow(a, b); break;
            default: throw new Error(`Syntax Error: Unsupported operator "${token.value}"`);
          }
          stack.push(result);
        }
      } 
      else if (token.type === 'FUNCTION') {
        if (stack.length < 1) throw new Error(`Syntax Error: Missing operand for function "${token.value}"`);
        const arg = stack.pop();
        
        let result;
        switch (token.value) {
          case 'sin': result = Math.sin(arg); break;
          case 'cos': result = Math.cos(arg); break;
          case 'tan': result = Math.tan(arg); break;
          case 'sqrt': 
            if (arg < 0) throw new Error('Square root of negative number is complex (unsupported)');
            result = Math.sqrt(arg); 
            break;
          case 'log': 
            if (arg <= 0) throw new Error('Logarithm of non-positive number is undefined');
            result = Math.log10(arg); 
            break;
          case 'ln': 
            if (arg <= 0) throw new Error('Natural logarithm of non-positive number is undefined');
            result = Math.log(arg); 
            break;
          default: throw new Error(`Syntax Error: Unsupported function "${token.value}"`);
        }
        stack.push(result);
      }
    }

    if (stack.length !== 1) {
      throw new Error('Syntax Error: Incomplete expression');
    }

    const finalVal = stack[0];
    if (isNaN(finalVal) || !isFinite(finalVal)) {
      throw new Error('Math Error: Indeterminate or out-of-bounds result');
    }

    return finalVal;
  }

  /**
   * Main entrypoint to safely parse and calculate an expression.
   */
  function parseAndCalculate(expr) {
    if (!expr || expr.trim() === '') {
      return 0;
    }
    
    // Step 1: Lexical analysis (string -> tokens)
    let tokens = tokenize(expr);
    
    // Step 2: Preprocess to resolve implicit products (e.g., 2π -> 2*π)
    tokens = insertImplicitMultiplication(tokens);
    
    // Step 3: Preprocess to identify unary negatives (e.g. -5 -> u- 5)
    tokens = identifyUnaryOperators(tokens);
    
    // Step 4: Shunting-yard infix to postfix (RPN)
    const rpn = shuntingYard(tokens);
    
    // Step 5: Postfix RPN evaluation
    return evaluateRPN(rpn);
  }

  /**
   * Helper to format values elegantly (truncates float artifacts, uses exponents for massive numbers)
   */
  function formatResult(val) {
    if (val === 0) return '0';
    
    // Handle floating-point imprecision artifacts (e.g., 0.1 + 0.2 = 0.30000000000000004)
    // Round to 10 decimal places to drop clean precision errors, then convert back
    let rounded = parseFloat(val.toFixed(10));
    
    // If rounded number matches exactly, use it
    if (Math.abs(rounded - val) < 1e-11) {
      val = rounded;
    }

    // Convert large or highly microscopic numbers to scientific notation
    if (Math.abs(val) >= 1e12 || (Math.abs(val) > 0 && Math.abs(val) < 1e-6)) {
      return val.toExponential(6);
    }
    
    // Limit total character width for displaying numbers
    const strVal = val.toString();
    if (strVal.length > 15) {
      return parseFloat(val.toPrecision(10)).toString();
    }
    
    return strVal;
  }

  return {
    calculate: parseAndCalculate,
    format: formatResult
  };

})();
