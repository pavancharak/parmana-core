import { describe, expect, it } from "vitest";

import {
  ExternalEndpointAddressError,
  checkEndpointUrl,
  isPublicAddress,
  resolvePublicEndpointAddresses,
  type ResolvedAddress,
} from "../../src/network/externalEndpointAddress.js";

function lookupReturning(...addresses: string[]) {
  return async (): Promise<readonly ResolvedAddress[]> =>
    addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
}

describe("checkEndpointUrl", () => {
  it("accepts an https URL with a public looking host name, and normalizes it", () => {
    const result = checkEndpointUrl(
      "https://ERP.Example.com:8443/parmana/release?tenant=1",
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.url.href).toBe(
      "https://erp.example.com:8443/parmana/release?tenant=1",
    );
  });

  it.each([
    ["not a string", 42],
    ["too long", `https://a.example.com/${"x".repeat(2048)}`],
    ["not a URL", "erp.example.com/release"],
    ["http", "http://erp.example.com/release"],
    ["another scheme", "ftp://erp.example.com/release"],
    ["user and password", "https://user:pass@erp.example.com/release"],
    ["a fragment", "https://erp.example.com/release#x"],
    ["an IPv4 literal", "https://203.0.114.10/release"],
    ["a private IPv4 literal", "https://10.0.0.5/release"],
    ["an IPv6 literal", "https://[2606:4700::1111]/release"],
    ["localhost", "https://localhost/release"],
    ["a localhost subdomain", "https://erp.localhost/release"],
    ["a single label host", "https://intranet/release"],
  ])("refuses %s", (_label, value) => {
    expect(checkEndpointUrl(value).ok).toBe(false);
  });
});

describe("isPublicAddress", () => {
  it.each([
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "64:ff9b::a00:1",
    "not an address",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "172.32.0.1", "203.0.114.10", "2606:4700::1111"])(
    "accepts %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe("resolvePublicEndpointAddresses", () => {
  const url = new URL("https://erp.example.com/release");

  it("returns every address when all are public", async () => {
    await expect(
      resolvePublicEndpointAddresses(
        url,
        lookupReturning("8.8.8.8", "2606:4700::1111"),
      ),
    ).resolves.toEqual([
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700::1111", family: 6 },
    ]);
  });

  it("refuses when any address is not public, even behind a public one", async () => {
    await expect(
      resolvePublicEndpointAddresses(
        url,
        lookupReturning("8.8.8.8", "169.254.169.254"),
      ),
    ).rejects.toThrow(/169\.254\.169\.254/);
  });

  it("refuses a host that does not resolve, or resolves to nothing", async () => {
    await expect(
      resolvePublicEndpointAddresses(url, async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toBeInstanceOf(ExternalEndpointAddressError);

    await expect(
      resolvePublicEndpointAddresses(url, lookupReturning()),
    ).rejects.toBeInstanceOf(ExternalEndpointAddressError);
  });
});
