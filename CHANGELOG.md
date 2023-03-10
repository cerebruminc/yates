# Changelog

## [2.0.3](https://github.com/cerebruminc/yates/compare/v2.0.2...v2.0.3) (2023-03-14)


### Bug Fixes

* Ensure that Yates works correctly with Prisma Fluent API ([1d85073](https://github.com/cerebruminc/yates/commit/1d85073510eebefc316e139a83da913d850c2a51))

## [2.0.2](https://github.com/cerebruminc/yates/compare/v2.0.1...v2.0.2) (2023-03-13)


### Bug Fixes

* ensure role setting still happens when using async middleware ([9d40852](https://github.com/cerebruminc/yates/commit/9d40852bc08f6f0d2212506723c5567d329e0581))

## [2.0.1](https://github.com/cerebruminc/yates/compare/v2.0.0...v2.0.1) (2023-02-28)


### Bug Fixes

* Fix broken formatting in README code blocks ([50434d7](https://github.com/cerebruminc/yates/commit/50434d7513e29f000a3b7ec22619da3b496e56c4))
* Improve error message thrown when an operation fails ([5b117c5](https://github.com/cerebruminc/yates/commit/5b117c5a5a3299bd5b2d7a21faded47df3ab288d))

## [2.0.0](https://github.com/cerebruminc/yates/compare/v1.2.0...v2.0.0) (2023-02-22)


### ⚠ BREAKING CHANGES

* Use client extensions instead of middleware

### Features

* Use client extensions instead of middleware ([f3fa1a3](https://github.com/cerebruminc/yates/commit/f3fa1a3d187d62031e2124d023ba726e7b810e39))


### Bug Fixes

* Explicity disconnect expression Prisma client ([ccceaa3](https://github.com/cerebruminc/yates/commit/ccceaa3f3baab26251b00b631962ae633deea714))
* Strongly type context values in expressions ([ec5e266](https://github.com/cerebruminc/yates/commit/ec5e2668a0ba776ed4319ade0940cd2f8dc9cbed))

## [1.2.0](https://github.com/cerebruminc/yates/compare/v1.1.1...v1.2.0) (2023-02-20)


### Features

* Add functionality for using Prisma as a query builder ([22d16a8](https://github.com/cerebruminc/yates/commit/22d16a8d21ea785256fe770747517e0a249e56c3))


### Bug Fixes

* Don't run integration tests when a PR is closed ([2b25093](https://github.com/cerebruminc/yates/commit/2b250937b0618d4ad7c7706286b74bca52603b22))

## [1.1.1](https://github.com/cerebruminc/yates/compare/v1.1.0...v1.1.1) (2023-01-30)


### Bug Fixes

* Export CustomAbilities type ([2cec86f](https://github.com/cerebruminc/yates/commit/2cec86f9e586db4cf0444bbc315af84e2c14a70a))

## [1.1.0](https://github.com/cerebruminc/yates/compare/v1.0.4...v1.1.0) (2023-01-30)


### Features

* Add ability to run release-please action manually ([9d610c7](https://github.com/cerebruminc/yates/commit/9d610c795bc307f7a09cb4fd36e645ea498e8f5c))
* Add functionality for removing old abilities from a role ([fa59c37](https://github.com/cerebruminc/yates/commit/fa59c372c4b9233ed65b51385a3a4e32775b8059))


### Bug Fixes

* Ensure setup parameters are sanitized ([0d302ab](https://github.com/cerebruminc/yates/commit/0d302ab9e9f97a7cbf23df3142d1835fbd7ed213))
* improve abilities typings ([ade47b8](https://github.com/cerebruminc/yates/commit/ade47b860b1aa8a7f114289b2905138ff85d0a76))
* Increase test coverage and improve setup safety ([ef7d395](https://github.com/cerebruminc/yates/commit/ef7d395003c39bce512dbeb10adc6cd0c19fbc26))

## [1.0.4](https://github.com/cerebruminc/yates/compare/v1.0.3...v1.0.4) (2023-01-24)


### Bug Fixes

* Use privileged Prisma client when setting config in transaction ([b8935e6](https://github.com/cerebruminc/yates/commit/b8935e69a630602a5f8ff0093edc5c95247b20b7))

## [1.0.3](https://github.com/cerebruminc/yates/compare/v1.0.2...v1.0.3) (2023-01-24)


### Bug Fixes

* Don't rerun middleware when applying RLC policies ([39433d8](https://github.com/cerebruminc/yates/commit/39433d8f4678f5238737a8111ca2fde293168296))

## [1.0.2](https://github.com/cerebruminc/yates/compare/v1.0.1...v1.0.2) (2023-01-24)


### Bug Fixes

* Publish package as public explicitly ([2b200e5](https://github.com/cerebruminc/yates/commit/2b200e5e3815c70e9bbf73182613bd5b4997ecb5))

## [1.0.1](https://github.com/cerebruminc/yates/compare/v1.0.0...v1.0.1) (2023-01-24)


### Bug Fixes

* Add NPM version badge to README ([5198969](https://github.com/cerebruminc/yates/commit/51989692711746660bb19044ea732655a1f4ad7b))

## 1.0.0 (2023-01-20)


### Features

* Add basic integration testing ([27bb368](https://github.com/cerebruminc/yates/commit/27bb3680515ffab8868847cfb6d310a2c8abac3e))


### Bug Fixes

* Update .npmignore to be more aggressive ([3915869](https://github.com/cerebruminc/yates/commit/3915869fd9b8df96b499d53bd5566b06f05c4cc1))
* Update Icon to something more thematic ([d37a4e4](https://github.com/cerebruminc/yates/commit/d37a4e4141a153c7d598875ec13bfebce63c31f9))
* Use package-lock for keying action cache ([92375a6](https://github.com/cerebruminc/yates/commit/92375a6bb45586551c8d1a8c5bce600b97346b13))
