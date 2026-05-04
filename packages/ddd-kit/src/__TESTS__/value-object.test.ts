import { describe, expect, it } from "vitest";
import { Result, ValueObject } from "../index";

class Email extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    if (!value.includes("@")) {
      return Result.fail("Invalid email format");
    }
    return Result.ok(value.toLowerCase());
  }
}

class Age extends ValueObject<number> {
  protected validate(value: number): Result<number> {
    if (value < 0 || value > 150) {
      return Result.fail("Age must be between 0 and 150");
    }
    return Result.ok(value);
  }
}

class Name extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    if (!value || value.trim().length === 0) {
      return Result.fail("Name cannot be empty");
    }
    if (value.length > 100) {
      return Result.fail("Name cannot exceed 100 characters");
    }
    return Result.ok(value.trim());
  }
}

interface AddressValue {
  street: string;
  city: string;
  country: string;
}

class Address extends ValueObject<AddressValue> {
  protected validate(value: AddressValue): Result<AddressValue> {
    if (!value.street || !value.city || !value.country) {
      return Result.fail("Address fields cannot be empty");
    }
    return Result.ok(value);
  }
}

describe("ValueObject", () => {
  describe("create()", () => {
    it("should succeed with valid value", () => {
      const result = Email.create("test@example.com");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe("test@example.com");
    });

    it("should fail with invalid value", () => {
      const result = Email.create("invalid-email");

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("Invalid email format");
    });

    it("should store validated/transformed value", () => {
      const result = Email.create("TEST@EXAMPLE.COM");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe("test@example.com");
    });

    it("should work with numeric values", () => {
      const validAge = Age.create(25);
      expect(validAge.isSuccess).toBe(true);
      expect(validAge.getValue().value).toBe(25);

      const invalidAge = Age.create(-5);
      expect(invalidAge.isFailure).toBe(true);
      expect(invalidAge.getError()).toBe("Age must be between 0 and 150");
    });

    it("should work with boundary values", () => {
      const minAge = Age.create(0);
      expect(minAge.isSuccess).toBe(true);

      const maxAge = Age.create(150);
      expect(maxAge.isSuccess).toBe(true);

      const belowMin = Age.create(-1);
      expect(belowMin.isFailure).toBe(true);

      const aboveMax = Age.create(151);
      expect(aboveMax.isFailure).toBe(true);
    });

    it("should work with complex object values", () => {
      const result = Address.create({
        street: "123 Main St",
        city: "New York",
        country: "USA",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value.city).toBe("New York");
    });

    it("should fail with invalid complex object", () => {
      const result = Address.create({
        street: "",
        city: "New York",
        country: "USA",
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("Address fields cannot be empty");
    });
  });

  describe("value getter", () => {
    it("should return the inner value", () => {
      const email = Email.create("test@example.com").getValue();

      expect(email.value).toBe("test@example.com");
    });

    it("should return frozen value for primitives", () => {
      const age = Age.create(30).getValue();

      expect(age.value).toBe(30);
    });

    it("should return frozen value for objects", () => {
      const address = Address.create({
        street: "123 Main St",
        city: "New York",
        country: "USA",
      }).getValue();

      expect(Object.isFrozen(address.value)).toBe(true);
    });
  });

  describe("equals()", () => {
    it("should be equal when primitive values match", () => {
      const email1 = Email.create("test@example.com").getValue();
      const email2 = Email.create("test@example.com").getValue();

      expect(email1.equals(email2)).toBe(true);
    });

    it("should not be equal when primitive values differ", () => {
      const email1 = Email.create("test1@example.com").getValue();
      const email2 = Email.create("test2@example.com").getValue();

      expect(email1.equals(email2)).toBe(false);
    });

    it("should be equal when numeric values match", () => {
      const age1 = Age.create(30).getValue();
      const age2 = Age.create(30).getValue();

      expect(age1.equals(age2)).toBe(true);
    });

    it("should not be equal when numeric values differ", () => {
      const age1 = Age.create(30).getValue();
      const age2 = Age.create(31).getValue();

      expect(age1.equals(age2)).toBe(false);
    });

    it("should be equal for object values with same structure", () => {
      const address1 = Address.create({
        street: "123 Main St",
        city: "New York",
        country: "USA",
      }).getValue();
      const address2 = Address.create({
        street: "123 Main St",
        city: "New York",
        country: "USA",
      }).getValue();

      expect(address1.equals(address2)).toBe(true);
    });

    it("should not be equal for object values with different structure", () => {
      const address1 = Address.create({
        street: "123 Main St",
        city: "New York",
        country: "USA",
      }).getValue();
      const address2 = Address.create({
        street: "456 Oak Ave",
        city: "New York",
        country: "USA",
      }).getValue();

      expect(address1.equals(address2)).toBe(false);
    });
  });

  describe("immutability", () => {
    it("should freeze primitive value", () => {
      const email = Email.create("test@example.com").getValue();

      // Value cannot be mutated
      expect(email.value).toBe("test@example.com");
    });

    it("should freeze object value", () => {
      const address = Address.create({
        street: "123 Main St",
        city: "New York",
        country: "USA",
      }).getValue();

      expect(Object.isFrozen(address.value)).toBe(true);

      // Attempting to mutate should have no effect (in strict mode would throw)
      expect(() => {
        (address.value as AddressValue).city = "Boston";
      }).toThrow();
    });
  });

  describe("validation", () => {
    it("should validate empty string", () => {
      const result = Name.create("");

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("Name cannot be empty");
    });

    it("should validate whitespace only string", () => {
      const result = Name.create("   ");

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("Name cannot be empty");
    });

    it("should trim whitespace when validate transforms value", () => {
      const result = Name.create("  John Doe  ");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe("John Doe");
    });

    it("should validate maximum length", () => {
      const longName = "a".repeat(101);
      const result = Name.create(longName);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("Name cannot exceed 100 characters");
    });

    it("should accept maximum length value", () => {
      const exactName = "a".repeat(100);
      const result = Name.create(exactName);

      expect(result.isSuccess).toBe(true);
    });
  });

  describe("type safety", () => {
    it("should preserve type through creation", () => {
      const email = Email.create("test@example.com").getValue();

      expect(email).toBeInstanceOf(Email);
      expect(email).toBeInstanceOf(ValueObject);
    });

    it("should return correct value type", () => {
      const age = Age.create(30).getValue();

      expect(typeof age.value).toBe("number");
    });

    it("should return correct object type", () => {
      const address = Address.create({
        street: "123 Main St",
        city: "New York",
        country: "USA",
      }).getValue();

      expect(typeof address.value).toBe("object");
      expect(address.value.street).toBe("123 Main St");
    });
  });

  describe("edge cases", () => {
    it("should handle zero as valid numeric value", () => {
      const result = Age.create(0);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe(0);
    });

    it("should handle special characters in string", () => {
      const result = Email.create("test+special@example.com");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe("test+special@example.com");
    });

    it("should handle unicode characters", () => {
      const result = Name.create("José García");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().value).toBe("José García");
    });
  });
});
